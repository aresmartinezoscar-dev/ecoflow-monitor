#!/usr/bin/env python3
"""
Script para consultar la API de EcoFlow y guardar datos históricos
Se ejecuta cada 5 minutos mediante GitHub Actions
"""

import os
import json
import time
import hmac
import hashlib
import requests
from datetime import datetime, timezone

# ========================================
# CONFIGURACIÓN DE DISPOSITIVOS
# ========================================
# Para añadir nuevos dispositivos, simplemente agrégalos aquí:
DEVICES = [
    {
        "name": "DELTA 2 Max Principal",
        "sn": "R351ZAB5PGAW0684",
        "type": "delta2max",
        "always_online": True  # Cambiar a False si no tiene WiFi constante
    },
    {
        "name": "RIVER 2 Max Solar",
        "sn": "R611ZAB6XGBQ0739",
        "type": "river2max",
        "always_online": True
    },
    # Ejemplo para agregar más dispositivos:
    # {
    #     "name": "RIVER 2 Max Beneficiario 1",
    #     "sn": "R611ZAB6XGBQ9999",
    #     "type": "river2max",
    #     "always_online": False  # Este se conecta ocasionalmente
    # },
]

# ========================================
# CONFIGURACIÓN DE API
# ========================================
API_BASE_URL = "https://api.ecoflow.com"
API_ENDPOINT_DEVICE = "/iot-open/sign/device/quota"

# Credenciales desde variables de entorno (GitHub Secrets)
ACCESS_KEY = os.environ.get("ECOFLOW_ACCESS_KEY", "")
SECRET_KEY = os.environ.get("ECOFLOW_SECRET_KEY", "")

# Archivo donde se guardan los datos históricos
DATA_FILE = "data/ecoflow_history.json"


# ========================================
# FUNCIONES DE API
# ========================================

def generate_signature(access_key, secret_key, params, nonce, timestamp):
    """
    Genera la firma HMAC-SHA256 requerida por EcoFlow API
    Para POST requests, no incluimos los params en la firma
    """
    # Para POST, solo incluimos accessKey, nonce y timestamp
    sign_str = f"accessKey={access_key}&nonce={nonce}&timestamp={timestamp}"
    
    # Generar firma HMAC-SHA256
    signature = hmac.new(
        secret_key.encode('utf-8'),
        sign_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return signature


def get_device_data(device_sn):
    """
    Obtiene los datos de un dispositivo específico desde la API de EcoFlow
    
    Parámetros clave que obtenemos:
    - bms_bmsStatus.soc: Porcentaje de batería (0-100)
    - inv.inputWatts: Entrada solar en Watts
    - inv.outputWatts: Salida total en Watts
    """
    if not ACCESS_KEY or not SECRET_KEY:
        print("❌ ERROR: Credenciales no configuradas")
        return None
    
    # Parámetros de la solicitud
    params = {
        "sn": device_sn,
        # Parámetros clave a consultar:
        "params": "bms_bmsStatus.soc,inv.inputWatts,inv.outputWatts,bms_bmsStatus.designCap,bms_bmsStatus.remainCap"
    }
    
    # Generar nonce y timestamp
    nonce = str(int(time.time() * 1000))
    timestamp = str(int(time.time() * 1000))
    
    # Generar firma
    signature = generate_signature(ACCESS_KEY, SECRET_KEY, params, nonce, timestamp)
    
    # Headers
    headers = {
        "accessKey": ACCESS_KEY,
        "nonce": nonce,
        "timestamp": timestamp,
        "sign": signature,
        "Content-Type": "application/json"
    }
    
    # Realizar petición (POST, no GET)
    url = f"{API_BASE_URL}{API_ENDPOINT_DEVICE}"
    
    try:
        response = requests.post(url, headers=headers, json=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "0":
                return data.get("data", {})
            else:
                print(f"⚠️  API Error para {device_sn}: {data.get('message', 'Unknown error')}")
                return None
        else:
            print(f"⚠️  HTTP Error {response.status_code} para {device_sn}")
            return None
            
    except requests.exceptions.Timeout:
        print(f"⏱️  Timeout al consultar {device_sn} (probablemente offline)")
        return None
    except Exception as e:
        print(f"❌ Error al consultar {device_sn}: {str(e)}")
        return None


def parse_device_data(raw_data):
    """
    Procesa los datos crudos de la API y extrae los valores importantes
    """
    if not raw_data:
        return None
    
    try:
        # Extraer porcentaje de batería
        soc = raw_data.get("bms_bmsStatus.soc", 0)
        
        # Extraer entrada solar (W)
        input_watts = raw_data.get("inv.inputWatts", 0)
        
        # Extraer salida total (W)
        output_watts = raw_data.get("inv.outputWatts", 0)
        
        # Capacidad (opcional, para cálculos avanzados)
        design_cap = raw_data.get("bms_bmsStatus.designCap", 0)
        remain_cap = raw_data.get("bms_bmsStatus.remainCap", 0)
        
        return {
            "battery_percent": round(soc, 1),
            "solar_input_w": round(input_watts, 1),
            "total_output_w": round(output_watts, 1),
            "design_capacity_wh": design_cap,
            "remaining_capacity_wh": remain_cap,
            "online": True
        }
    except Exception as e:
        print(f"❌ Error al parsear datos: {str(e)}")
        return None


# ========================================
# GESTIÓN DE DATOS HISTÓRICOS
# ========================================

def load_history():
    """Carga el historial de datos desde el archivo JSON"""
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"⚠️  Error al cargar historial: {e}")
            return {}
    return {}


def save_history(history):
    """Guarda el historial de datos en el archivo JSON"""
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)


def add_data_point(history, device_sn, device_name, data_point):
    """Añade un nuevo punto de datos al historial"""
    if device_sn not in history:
        history[device_sn] = {
            "device_name": device_name,
            "serial_number": device_sn,
            "readings": []
        }
    
    # Añadir timestamp ISO 8601
    data_point["timestamp"] = datetime.now(timezone.utc).isoformat()
    
    # Agregar el punto de datos
    history[device_sn]["readings"].append(data_point)
    
    # Mantener solo los últimos 90 días (para no saturar)
    # 90 días * 24 horas * 12 lecturas/hora (cada 5 min) = 25,920 puntos
    max_readings = 26000
    if len(history[device_sn]["readings"]) > max_readings:
        history[device_sn]["readings"] = history[device_sn]["readings"][-max_readings:]
    
    return history


# ========================================
# FUNCIÓN PRINCIPAL
# ========================================

def main():
    """
    Función principal que consulta todos los dispositivos y guarda los datos
    """
    print("=" * 60)
    print(f"🔋 EcoFlow Data Fetcher - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Cargar historial existente
    history = load_history()
    
    # Contador de éxitos
    successful_reads = 0
    failed_reads = 0
    
    # Consultar cada dispositivo
    for device in DEVICES:
        device_sn = device["sn"]
        device_name = device["name"]
        
        print(f"\n📡 Consultando: {device_name} ({device_sn})...")
        
        # Obtener datos de la API
        raw_data = get_device_data(device_sn)
        
        if raw_data:
            # Parsear datos
            parsed_data = parse_device_data(raw_data)
            
            if parsed_data:
                # Guardar en historial
                history = add_data_point(history, device_sn, device_name, parsed_data)
                
                print(f"   ✅ Batería: {parsed_data['battery_percent']}%")
                print(f"   ☀️  Entrada solar: {parsed_data['solar_input_w']} W")
                print(f"   ⚡ Salida total: {parsed_data['total_output_w']} W")
                
                successful_reads += 1
            else:
                print(f"   ⚠️  No se pudieron parsear los datos")
                failed_reads += 1
        else:
            # Dispositivo offline o error
            if not device.get("always_online", True):
                print(f"   ⏸️  Dispositivo offline (esperado)")
            else:
                print(f"   ❌ No se pudieron obtener datos")
            
            failed_reads += 1
    
    # Guardar historial actualizado
    save_history(history)
    
    print("\n" + "=" * 60)
    print(f"✅ Lecturas exitosas: {successful_reads}")
    print(f"❌ Lecturas fallidas: {failed_reads}")
    print(f"💾 Datos guardados en: {DATA_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
