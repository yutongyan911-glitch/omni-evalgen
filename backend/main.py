from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import glob
import os
import io
from fastapi.responses import Response

app = FastAPI(title="EvalGen Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 自动获取项目根目录下的 data 文件夹
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
# 确保文件夹存在
os.makedirs(DATA_DIR, exist_ok=True)
# 全局缓存，用于存放预览阶段的抽样结果
CACHED_RESULTS = {} # { preview_id: { "df": DataFrame, "filename": str } }

# 预定义的难度和应用场景关键词（用于从“挑战点”中剥离）
DIFFICULTY_KEYWORDS = {"简单", "中等", "困难"}
SCENARIO_KEYWORDS = {"品牌广告", "效果广告", "影视剧", "纪录片", "短剧或漫剧", "音乐或歌舞类", "游戏开发", "UGC或PUGC内容"}

class FilterCondition(BaseModel):
    dimension: str  # e.g., '难度', '应用场景', '类目', '二级维度', '挑战点'
    value: str
    operator: str   # '=', '>=', '<=', '≈'
    target: float   # e.g., 50 for 50 items, or 0.3 for 30% depending on context.

class GenerateRequest(BaseModel):
    file_name: str
    total_target_count: int
    priorities: List[str]
    conditions: List[FilterCondition]
    mode: str = "full"  # "template" or "full"

@app.get("/api/datasets")
def get_datasets():
    files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    return {"datasets": [os.path.basename(f) for f in files if not f.startswith("~") and not f.startswith("Generated")]}

@app.get("/api/schema")
def get_schema(file_name: str):
    file_path = os.path.join(DATA_DIR, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading excel: {str(e)}")

    schema = {
        "难度": set(),
        "应用场景": set(),
        "类目": set(),
        "二级维度": set(),
        "挑战点": set()
    }
    
    if "类目" in df.columns:
        schema["类目"].update(df["类目"].dropna().astype(str).unique())
    if "二级维度" in df.columns:
        schema["二级维度"].update(df["二级维度"].dropna().astype(str).unique())
        
    if "挑战点" in df.columns:
        raw_challenges = df["挑战点"].dropna().astype(str).unique()
        for item in raw_challenges:
            for sub_item in item.replace('，', ',').split(','):
                val = sub_item.strip()
                if not val:
                    continue
                if val in DIFFICULTY_KEYWORDS:
                    schema["难度"].add(val)
                elif val in SCENARIO_KEYWORDS:
                    schema["应用场景"].add(val)
                else:
                    schema["挑战点"].add(val)
                    
    import json
    if "running_params" in df.columns:
        schema["参数要求"] = set()
        # Ensure base duration tags exist
        schema["参数要求"].update(["时长<=5s", "时长<=10s", "时长<=15s", "时长>15s"])
        for val in df["running_params"].dropna().astype(str):
            try:
                params = json.loads(val)
                if "aspect_ratio" in params:
                    schema["参数要求"].add(f"长宽比:{params['aspect_ratio']}")
                if "prefer_multi_shots" in params:
                    schema["参数要求"].add(f"多镜头开关:{str(params['prefer_multi_shots']).lower()}")
            except:
                pass

    # Convert sets to sorted lists
    result = {}
    for k, v in schema.items():
        if k == "参数要求":
            def custom_sort(item):
                if item.startswith("时长"):
                    if "<=5s" in item: return 0
                    if "<=10s" in item: return 1
                    if "<=15s" in item: return 2
                    if ">15s" in item: return 3
                    return 4
                elif item.startswith("长宽比"): return 10
                elif item.startswith("多镜头"): return 20
                return 100
            result[k] = sorted(list(v), key=lambda x: (custom_sort(x), x))
        else:
            result[k] = sorted(list(v))
            
    return result

@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
    
    file_path = os.path.join(DATA_DIR, file.filename)
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        return {"message": "File uploaded successfully", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/generate")
def generate_dataset(req: GenerateRequest):
    import math
    import random
    from fastapi.responses import StreamingResponse

    file_path = os.path.join(DATA_DIR, req.file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    df = pd.read_excel(file_path)
    
    targets = {}
    for c in req.conditions:
        if c.operator == '≈':
            tgt = int(math.ceil(req.total_target_count * (c.target / 100.0)))
        else:
            tgt = int(c.target)
        targets[(c.dimension, c.value)] = tgt
        
    def row_has_tag(row, dimension, value):
        if dimension == "类目":
            return str(row.get("类目", "")) == value
        if dimension == "二级维度":
            return str(row.get("二级维度", "")) == value
        if dimension in ["难度", "应用场景", "挑战点"]:
            val_str = str(row.get("挑战点", ""))
            tags = [t.strip() for t in val_str.replace('，', ',').split(',')]
            return value in tags
            
        if dimension == "参数要求":
            rp_str = str(row.get("running_params", "{}"))
            if pd.isna(row.get("running_params")) or not rp_str:
                return False
            try:
                import json
                params = json.loads(rp_str)
            except:
                return False
                
            # Check duration
            d_str = str(params.get("duration", "0")).replace("s", "").replace("m", "").strip()
            try:
                d_int = int(float(d_str))
            except:
                d_int = -1
                
            if value == "时长<=5s" and d_int != -1 and d_int <= 5: return True
            if value == "时长<=10s" and d_int != -1 and 5 < d_int <= 10: return True
            if value == "时长<=15s" and d_int != -1 and 10 < d_int <= 15: return True
            if value == "时长>15s" and d_int != -1 and d_int > 15: return True
            
            # Check aspect_ratio
            if value == f"长宽比:{params.get('aspect_ratio', '')}": return True
            
            # Check prefer_multi_shots
            bool_str = "true" if params.get("prefer_multi_shots") else "false"
            if value == f"多镜头开关:{bool_str}": return True
            
            return False

    selected_indices = set()
    available_indices = set(df.index.tolist())
    current_counts = {k: 0 for k in targets.keys()}
    
    # Weight multipliers: first priority gets highest weight
    priority_weights = {p: (len(req.priorities) - idx) * 10 for idx, p in enumerate(req.priorities)}
    
    row_tags = {i: [] for i in df.index}
    for i, row in df.iterrows():
        for (dim, val) in targets.keys():
            if row_has_tag(row, dim, val):
                row_tags[i].append((dim, val))

    # Fallback safety: if no constraints, randomly select
    if not targets:
        select_count = min(req.total_target_count, len(available_indices))
        selected_indices = set(random.sample(list(available_indices), select_count))
    else:
        while len(selected_indices) < req.total_target_count and available_indices:
            weights = {}
            for i in available_indices:
                w = 1.0 # base weight
                for tag in row_tags[i]:
                    if current_counts[tag] < targets[tag]:
                        w += priority_weights.get(tag[0], 1) * 10
                weights[i] = w
                
            max_w = max(weights.values())
            best_candidates = [i for i, w in weights.items() if w == max_w]
            chosen = random.choice(best_candidates)
            
            selected_indices.add(chosen)
            available_indices.remove(chosen)
            
            for tag in row_tags[chosen]:
                current_counts[tag] += 1

    final_df = df.loc[list(selected_indices)].copy()
    
    import uuid
    preview_id = str(uuid.uuid4())
    
    # 将结果存入缓存，而不是立即写死文件
    CACHED_RESULTS[preview_id] = {
        "df": final_df,
        "original_file": req.file_name
    }
            
    stats = {}
    import json
    for dim in ["难度", "类目", "应用场景", "二级维度", "挑战点", "参数要求"]:
        stats[dim] = {}
        for _, row in final_df.iterrows():
            tags = []
            if dim == "类目": tags = [str(row.get("类目", ""))]
            elif dim == "二级维度": tags = [str(row.get("二级维度", ""))]
            elif dim in ["难度", "应用场景", "挑战点"]:
                val_str = str(row.get("挑战点", ""))
                all_tags = [t.strip() for t in val_str.replace('，', ',').split(',')]
                if dim == "难度": tags = [t for t in all_tags if t in DIFFICULTY_KEYWORDS]
                elif dim == "应用场景": tags = [t for t in all_tags if t in SCENARIO_KEYWORDS]
                else: tags = [t for t in all_tags if t not in DIFFICULTY_KEYWORDS and t not in SCENARIO_KEYWORDS and t]
            elif dim == "参数要求":
                rp_str = str(row.get("running_params", "{}"))
                if not pd.isna(row.get("running_params")) and rp_str:
                    try:
                        params = json.loads(rp_str)
                        d_str = str(params.get("duration", "0")).replace("s", "").replace("m", "").strip()
                        try:
                            d_int = int(float(d_str))
                            if d_int != -1:
                                if d_int <= 5: tags.append("时长<=5s")
                                elif d_int <= 10: tags.append("时长<=10s")
                                elif d_int <= 15: tags.append("时长<=15s")
                                else: tags.append("时长>15s")
                        except: pass
                        if "aspect_ratio" in params: tags.append(f"长宽比:{params['aspect_ratio']}")
                        if "prefer_multi_shots" in params: tags.append(f"多镜头开关:{str(params['prefer_multi_shots']).lower()}")
                    except: pass
            
            for t in tags:
                if t and t != "nan":
                    stats[dim][t] = stats[dim].get(t, 0) + 1

    return {
        "preview_id": preview_id,
        "total": len(final_df),
        "stats": stats
    }

@app.get("/api/download/{preview_id}")
def download_preview(preview_id: str, mode: str = "full"):
    import urllib.parse
    if preview_id not in CACHED_RESULTS:
        raise HTTPException(status_code=404, detail="Preview expired or not found")
        
    res_data = CACHED_RESULTS[preview_id]
    final_df = res_data["df"]
    original_file = res_data["original_file"]
    
    output_filename = f"Generated_{mode}_{original_file}"
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if mode == "template":
            index_col = "index"
            if "ID" in final_df.columns: index_col = "ID"
            elif "题号" in final_df.columns: index_col = "题号"
            
            template_df = pd.DataFrame()
            template_df["index"] = final_df[index_col] if index_col in final_df.columns else final_df.index
            template_df["blobstore桶"] = "mmu-model-eval"
            base_folder = original_file.replace('.xlsx', '')
            template_df["视频blobstorekey"] = template_df["index"].apply(lambda x: f"OmniVideo_V4/{base_folder}/videos/{x}.mp4")
            template_df["生成视频长度（ms）"] = 5133
            template_df.to_excel(writer, index=False)
        else:
            final_df.to_excel(writer, index=False)
    
    output.seek(0)
    return Response(
        content=output.getvalue(),
        headers={
            'Content-Disposition': f"attachment; filename*=UTF-8''{urllib.parse.quote(output_filename)}",
            'Access-Control-Expose-Headers': 'Content-Disposition'
        },
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
