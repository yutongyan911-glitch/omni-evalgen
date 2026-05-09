import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

TEST_EXCEL_FILE = "Omni_组合能力专项_V4测试.xlsx"

def test_schema_extraction_behavior():
    """
    Tracer Bullet: Verify that the schema endpoint can correctly parse
    the provided Excel file and extract expected dimension arrays.
    """
    response = client.get(f"/api/schema?file_name={TEST_EXCEL_FILE}")
    
    # 验证接口响应正常
    assert response.status_code == 200, f"Expected 200, got {response.status_code} with {response.text}"
    
    data = response.json()
    
    # 验证核心维度是否都存在且被正确解析成了列表
    expected_dimensions = ["难度", "应用场景", "类目", "二级维度", "挑战点"]
    for dim in expected_dimensions:
        assert dim in data, f"Missing dimension: {dim}"
        assert isinstance(data[dim], list), f"Dimension {dim} should be a list"

    # 如果有内容，至少应该不是空的字典
    assert any(len(v) > 0 for v in data.values()), "Schema should not be completely empty for a valid dataset"


def test_generate_absolute_constraints_behavior():
    """
    Tracer Bullet 2: Verify that greedy sampling correctly respects
    absolute target counts for dimensions when possible.
    """
    payload = {
        "file_name": TEST_EXCEL_FILE,
        "total_target_count": 20,
        "priorities": ["难度"],
        "conditions": [
            {
                "dimension": "难度",
                "value": "中等",
                "operator": "=",
                "target": 9
            }
        ],
        "mode": "full"
    }
    
    # Step 1: Generate Preview JSON
    response = client.post("/api/generate", json=payload)
    assert response.status_code == 200
    preview_json = response.json()
    
    assert "preview_id" in preview_json
    assert "stats" in preview_json
    
    stats_medium = preview_json["stats"].get("难度", {}).get("中等", 0)
    assert stats_medium >= 9, f"Stats in JSON should show >=9 '中等', got {stats_medium}"

    # Step 2: Download Excel
    download_res = client.get(f"/api/download/{preview_json['preview_id']}?mode=full")
    assert download_res.status_code == 200
    
    df = pd.read_excel(io.BytesIO(download_res.content))
    assert len(df) == 20
    
    # Step 3: Verify Consistency
    def has_medium_difficulty(val):
        if pd.isna(val): return False
        tags = [t.strip() for t in str(val).replace('，', ',').split(',')]
        return "中等" in tags
        
    actual_medium_count = sum(df["挑战点"].apply(has_medium_difficulty))
    assert actual_medium_count == stats_medium, f"Mismatch! JSON said {stats_medium}, but Excel has {actual_medium_count}"
    assert actual_medium_count >= 9
