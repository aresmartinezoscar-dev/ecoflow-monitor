#!/usr/bin/env python3
"""
Script para consultar la API de EcoFlow y guardar datos históricos
Versión corregida con firma HMAC correcta
Se ejecuta cada 5 minutos mediante GitHub Actions
"""

import os
import json
import time
import random
import hmac
import hashlib
import requests
from datetime import datetime, timezone

# ========================================
# CONFIGURACIÓN DE DISPOSITIVOS
# ========================================
# Solo DELTA 2 Max con batería adicional
DEVICES = [
    {
        "name": "DELTA 2 Max + Batería Adicional",
        "sn": "R351ZAB5PGAW0684",
        "type": "delta2max",
        "always_online": True,
        "has_extra_battery": True  # Indica que tiene batería adicional
    },
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
# FUNCIONES DE FIRMA HMAC (MÉTODO CORRECTO)
# ========================================

def flatten_params(data, prefix=""):
    """
    Aplana un diccionario anidado para la firma.
    Ejemplo: {"params": {"quotas": ["a", "b"]}} -> {"params.quotas[0]": "a", "params.quotas[1]": "b"}
    """
    items = {}
    if isinstance(data, dict):
        for k, v in data.items():
            key = f"{prefix}{k}" if not prefix else f"{prefix}.{k}"
            if isinstance(v, dict):
                items.update(flatten_params(v, key))
            elif isinstance(v, list):
                for i, val in enumerate(v):
                    items[f"{key}[{i}]"] = val
            else:
                items[key] = v
    return items


def build_sign_string(params, access_key, nonce, timestamp):
    """
    Construye el string para firmar según el método correcto de EcoFlow:
    1. Parámetros del body ordenados alfabéticamente
    2. Luego accessKey, nonce, timestamp (sin ordenar)
    """
    flat = flatten_params(params)
    # Ordenar parámetros alfabéticamente
    sorted_params = "&".join([f"{k}={flat[k]}" for k in sorted(flat.keys())])
    # Añadir accessKey, nonce, timestamp AL FINAL
    sign_str = f"{sorted_params}&accessKey={access_key}&nonce={nonce}&timestamp={timestamp}"
    return sign_str


def generate_signature(access_key, secret_key, params, nonce, timestamp):
    """
    Genera la firma HMAC-SHA256 requerida por EcoFlow API (método correcto)
    """
    sign_str = build_sign_string(params, access_key, nonce, timestamp)
    
    # Generar firma HMAC-SHA256 en hexadecimal minúscula
    signature = hmac.new(
        secret_key.encode('utf-8'),
        sign_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return signature


# ========================================
# FUNCIONES DE API
# ========================================

def get_device_data(device_sn):
    """
    Obtiene los datos de un dispositivo específico desde la API de EcoFlow
    
    Parámetros que consultamos:
    - bms_bmsStatus.soc: Porcentaje de batería principal
    - inv.inputWatts: Entrada solar/AC en Watts
    - inv.outputWatts: Salida total en Watts
    - bms_bmsStatus.designCap: Capacidad diseñada batería principal
    - bms_bmsStatus.remainCap: Capacidad restante batería principal
    
    Para batería adicional (si existe):
    - bms_emsStatus.bmsModel: Modelo de batería adicional
    - bms_emsStatus.soc: SOC de batería adicional
    - bms_emsStatus.maxChargeSoc: SOC máximo combinado
    """
    if not ACCESS_KEY or not SECRET_KEY:
        print("❌ ERROR: Credenciales no configuradas")
        return None
    
    # Parámetros de la solicitud (estructura correcta con quotas)
    body = {
        "sn": device_sn,
        "params": {
            "quotas": [
                # Batería principal DELTA 2 Max
                "bms_bmsStatus.soc",            # SOC batería principal (100%)
                "bms_bmsStatus.designCap",      # Capacidad diseñada
                "bms_bmsStatus.remainCap",      # Capacidad restante
                "bms_bmsStatus.temp",           # Temperatura batería principal
                
                # Batería adicional
                "bms_emsStatus.soc",            # SOC batería adicional (77%)
                "bms_emsStatus.bmsModel",       # Modelo batería adicional
                "bms_emsStatus.maxChargeSoc",   # SOC combinado total (88%)
                "bms_emsStatus.minDsgSoc",      # SOC mínimo de descarga
                
                # Entrada REAL (solar + AC)
                "inv.acInVol",                  # Voltaje AC entrada
                "inv.acInAmp",                  # Amperaje AC entrada
                "inv.acInFreq",                 # Frecuencia AC entrada
                "mppt.inWatts",                 # Entrada solar MPPT
                "mppt.outWatts",                # Salida MPPT
                
                # Salida REAL (consumo)
                "inv.acOutVol",                 # Voltaje AC salida
                "inv.acOutAmp",                 # Amperaje AC salida
                "inv.acOutFreq",                # Frecuencia AC salida
                "inv.outputWatts",              # Potencia AC salida
                
                # Resumen de potencias del sistema
                "pd.wattsInSum",                # Entrada total al sistema
                "pd.wattsOutSum",               # Salida total del sistema
                "pd.chgPowerAC",                # Potencia carga AC
                "pd.chgPowerDC",                # Potencia carga DC (solar)
                "pd.dsgPowerAC",                # Potencia descarga AC
                "pd.dsgPowerDC",                # Potencia descarga DC
            ]
        }
    }
    
    # Generar nonce y timestamp
    nonce = str(random.randint(100000, 999999))
    timestamp = str(int(time.time() * 1000))
    
    # Generar firma con el método correcto
    signature = generate_signature(ACCESS_KEY, SECRET_KEY, body, nonce, timestamp)
    
    # Headers
    headers = {
        "accessKey": ACCESS_KEY,
        "nonce": nonce,
        "timestamp": timestamp,
        "sign": signature,
        "Content-Type": "application/json;charset=UTF-8"
    }
    
    # URL completa
    url = f"{API_BASE_URL}{API_ENDPOINT_DEVICE}"
    
    try:
        # Petición POST con body JSON
        response = requests.post(url, headers=headers, json=body, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "0":
                return data.get("data", {})
            else:
                print(f"⚠️  API Error para {device_sn}: {data.get('message', 'Unknown error')}")
                print(f"    Código: {data.get('code')}")
                return None
        else:
            print(f"⚠️  HTTP Error {response.status_code} para {device_sn}")
            print(f"    Respuesta: {response.text}")
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
    Calcula valores combinados correctamente según lo que muestra la app
    """
    if not raw_data:
        return None
    
    try:
        # === BATERÍAS ===
        # Batería principal DELTA 2 Max
        main_soc = raw_data.get("bms_bmsStatus.soc", 0)
        main_temp = raw_data.get("bms_bmsStatus.temp", 0)
        
        # Capacidades
        design_cap = raw_data.get("bms_bmsStatus.designCap", 0)
        remain_cap = raw_data.get("bms_bmsStatus.remainCap", 0)
        
        # Batería adicional
        extra_soc = raw_data.get("bms_emsStatus.soc")
        extra_model = raw_data.get("bms_emsStatus.bmsModel")
        combined_soc = raw_data.get("bms_emsStatus.maxChargeSoc")
        
        # Si hay batería adicional, usar el SOC combinado
        if extra_soc is not None and combined_soc is not None:
            battery_percent = combined_soc  # 88% en tu caso
            has_extra_battery = True
        else:
            battery_percent = main_soc
            has_extra_battery = False
        
        # === ENTRADA REAL (Solar + AC) ===
        # Entrada solar MPPT
        solar_input = raw_data.get("mppt.inWatts", 0) or raw_data.get("mppt.outWatts", 0)
        
        # Entrada AC
        ac_in_vol = raw_data.get("inv.acInVol", 0)
        ac_in_amp = raw_data.get("inv.acInAmp", 0)
        ac_input = ac_in_vol * ac_in_amp if ac_in_vol and ac_in_amp else 0
        
        # Entrada total REAL (no incluye carga interna de batería adicional)
        # Usamos pd.chgPowerAC + pd.chgPowerDC que da la entrada real
        total_input = raw_data.get("pd.chgPowerAC", 0) + raw_data.get("pd.chgPowerDC", 0)
        
        # Si no hay datos específicos, usar solar + AC calculados
        if total_input == 0:
            total_input = solar_input + ac_input
        
        # === SALIDA REAL (Consumo de dispositivos) ===
        # Salida AC (lo que consumen tus dispositivos - 165W en tu caso)
        output_watts = raw_data.get("inv.outputWatts", 0)
        
        # Alternativa: usar pd.dsgPowerAC que es la descarga AC
        if output_watts == 0:
            output_watts = raw_data.get("pd.dsgPowerAC", 0)
        
        # Si aún es 0, intentar calcular desde voltaje y amperaje
        if output_watts == 0:
            ac_out_vol = raw_data.get("inv.acOutVol", 0)
            ac_out_amp = raw_data.get("inv.acOutAmp", 0)
            if ac_out_vol and ac_out_amp:
                output_watts = ac_out_vol * ac_out_amp
        
        return {
            "battery_percent": round(battery_percent, 1),
            "main_battery_percent": round(main_soc, 1) if has_extra_battery else None,
            "extra_battery_percent": round(extra_soc, 1) if extra_soc is not None else None,
            "solar_input_w": round(total_input, 1),  # Entrada REAL (solar + AC)
            "total_output_w": round(output_watts, 1),  # Salida REAL (consumo)
            "design_capacity_wh": design_cap,
            "remaining_capacity_wh": remain_cap,
            "has_extra_battery": has_extra_battery,
            "extra_battery_model": extra_model if has_extra_battery else None,
            "main_temp": main_temp,
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
    
    # Mantener solo los últimos 90 días
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
                print(f"   ☀️  Entrada: {parsed_data['solar_input_w']} W")
                print(f"   ⚡ Salida: {parsed_data['total_output_w']} W")
                
                if parsed_data.get('has_extra_battery'):
                    print(f"   🔋 Con batería adicional detectada")
                
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
