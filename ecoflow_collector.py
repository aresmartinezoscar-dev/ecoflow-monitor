import os
import random
import time
import hmac
import hashlib
import requests
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, db

# === Config desde variables de entorno (GitHub Secrets) ===
API_BASE = "https://api.ecoflow.com"
ACCESS_KEY = os.environ["ECOFLOW_ACCESS_KEY"]
SECRET_KEY = os.environ["ECOFLOW_SECRET_KEY"]
DELTA_SN = os.environ["DELTA_SN"]
DATABASE_URL = os.environ["DATABASE_URL"]
DB_PATH = "ecoflow_logs"
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"  # lo crea el workflow


def hmac_sha256(data, key):
    return hmac.new(key.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()


def qstring(params):
    return "&".join(f"{k}={params[k]}" for k in sorted(params.keys()))


def flatten_params(data, prefix=""):
    items = {}
    if isinstance(data, dict):
        for k, v in data.items():
            key = f"{prefix}.{k}" if prefix else k
            val = v
            if isinstance(val, dict):
                items.update(flatten_params(val, key))
            elif isinstance(val, list):
                for i, elem in enumerate(val):
                    items[f"{key}[{i}]"] = elem
            else:
                items[key] = val
    return items


def build_sign_string(params, access_key, nonce, timestamp):
    flat = flatten_params(params)
    base = qstring(flat)
    base += f"&accessKey={access_key}&nonce={nonce}&timestamp={timestamp}"
    return base


def leer_ecoflow():
    body = {
        "sn": DELTA_SN,
        "params": {
            "quotas": [
                "bms_emsStatus.lcdShowSoc",        # SOC global
                "bms_bmsStatus.soc",               # SOC DELTA 2 Max
                "bms_slave_bmsSlaveStatus_1.soc",  # SOC batería adicional
                "pd.wattsInSum",                   # entrada total
                "pd.wattsOutSum"                   # salida total
            ]
        }
    }

    nonce = str(random.randint(100000, 999999))
    timestamp = str(int(time.time() * 1000))
    sign_str = build_sign_string(body, ACCESS_KEY, nonce, timestamp)
    sign = hmac_sha256(sign_str, SECRET_KEY)

    headers = {
        "accessKey": ACCESS_KEY,
        "nonce": nonce,
        "timestamp": timestamp,
        "sign": sign,
        "Content-Type": "application/json;charset=UTF-8",
    }

    r = requests.post(API_BASE + "/iot-open/sign/device/quota", headers=headers, json=body, timeout=10)
    r.raise_for_status()
    data = r.json()
    if data.get("code") != "0":
        raise RuntimeError(f"EcoFlow error {data.get('code')}: {data.get('message')}")

    d = data["data"]
    ts = int(time.time() * 1000)
    iso = datetime.now(timezone.utc).isoformat()

    return {
        "ts": ts,
        "iso": iso,
        "soc_global": d.get("bms_emsStatus.lcdShowSoc"),
        "soc_delta": d.get("bms_bmsStatus.soc"),
        "soc_extra": d.get("bms_slave_bmsSlaveStatus_1.soc"),
        "watts_in": d.get("pd.wattsInSum"),
        "watts_out": d.get("pd.wattsOutSum"),
    }


def main():
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred, {"databaseURL": DATABASE_URL})
    ref = db.reference(DB_PATH)
    payload = leer_ecoflow()
    ref.push(payload)
    print("✅ Datos enviados a Firebase:", payload)


if __name__ == "__main__":
    main()
