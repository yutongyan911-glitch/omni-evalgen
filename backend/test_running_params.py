import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

TEST_EXCEL_FILE = "Omni_组合能力专项_V4测试.xlsx"

def test_schema_running_params_extraction():
    """
    TDD Test: Verify that the schema endpoint extracts duration, aspect_ratio, 
    and prefer_multi_shots from running_params column.
    """
    response = client.get(f"/api/schema?file_name={TEST_EXCEL_FILE}")
    assert response.status_code == 200
    data = response.json()
    
    # Check if the new dimension is present in the schema
    assert "参数要求" in data, "Missing dimension: 参数要求"
    assert isinstance(data["参数要求"], list), "Dimension 参数要求 should be a list"
    assert "时长>15s" in data["参数要求"], "Missing 时长>15s in 参数要求"

def test_generate_running_params_constraints_with_preview():
    """
    TDD Test: Verify the new Preview -> Download flow and data consistency.
    """
    payload = {
        "file_name": TEST_EXCEL_FILE,
        "total_target_count": 10,
        "priorities": ["参数要求"],
        "conditions": [
            {
                "dimension": "参数要求",
                "value": "时长<=15s",
                "operator": "=",
                "target": 2
            }
        ],
        "mode": "full"
    }
    
    # Step 1: Generate Preview
    response = client.post("/api/generate", json=payload)
    assert response.status_code == 200
    preview_json = response.json()
    
    assert "preview_id" in preview_json
    assert "stats" in preview_json
    assert preview_json["total"] == 10
    
    # Check stats consistency in JSON
    stats_duration = preview_json["stats"].get("参数要求", {}).get("时长<=15s", 0)
    assert stats_duration >= 2, f"Stats in JSON should show >=2 for 时长<=15s, got {stats_duration}"

    # Step 2: Download Excel using preview_id
    download_url = f"/api/download/{preview_json['preview_id']}?mode=full"
    download_res = client.get(download_url)
    assert download_res.status_code == 200
    
    df = pd.read_excel(io.BytesIO(download_res.content))
    assert len(df) == 10
    
    # Step 3: Verify the actual Excel content matches the Preview Stats
    def check_duration(val):
        if pd.isna(val): return False
        try:
            import json
            params = json.loads(val)
            d_str = str(params.get("duration", "0")).replace("s", "").replace("m", "").strip()
            d_int = int(float(d_str))
            return 10 < d_int <= 15
        except: return False
            
    actual_valid_count = sum(df["running_params"].apply(check_duration))
    assert actual_valid_count == stats_duration, f"Mismatch! Stats said {stats_duration}, but Excel has {actual_valid_count}"
    assert actual_valid_count >= 2
