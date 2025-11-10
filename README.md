# 🔋 Monitor EcoFlow - Sistema de Monitoreo en Tiempo Real

Sistema completo para monitorear tus dispositivos EcoFlow (DELTA 2 Max, RIVER 2 Max, etc.) con gráficas en tiempo real, almacenamiento histórico y actualización automática cada 5 minutos.

---

## 🌟 Características

✅ **Monitoreo automático cada 5 minutos** de todos tus dispositivos EcoFlow  
✅ **Gráficas interactivas** de batería, entrada solar y salida de potencia  
✅ **Historial completo** (24h, 7 días, 30 días, 90 días)  
✅ **Alertas visuales** cuando la batería está por debajo del 15% (configurable)  
✅ **Compatible con dispositivos offline** - registra datos cuando se reconectan  
✅ **100% gratis** - alojado en GitHub Pages  
✅ **Sin autenticación** para ver datos - acceso público  
✅ **Credenciales seguras** - nunca expuestas en el código público  

---

## 📋 Requisitos Previos

1. ✅ Cuenta de desarrollador de EcoFlow aprobada (ya la tienes)
2. ✅ Cuenta de GitHub (gratuita)
3. ✅ Access Key y Secret Key de EcoFlow

---

## 🚀 Instalación - Paso a Paso

### **Paso 1: Crear el repositorio en GitHub**

1. Ve a [github.com](https://github.com) e inicia sesión
2. Clic en el botón **"New repository"** (esquina superior derecha)
3. Configura:
   - **Repository name**: `ecoflow-monitor` (o el nombre que prefieras)
   - **Description**: "Monitor en tiempo real de dispositivos EcoFlow"
   - ⚠️ **IMPORTANTE**: Marca como **Public** (necesario para GitHub Pages gratuito)
   - ✅ Marca "Add a README file"
4. Clic en **"Create repository"**

---

### **Paso 2: Subir los archivos al repositorio**

Tienes dos opciones:

#### **Opción A: Subir archivos desde la web (más fácil)**

1. En tu repositorio, clic en **"Add file"** → **"Upload files"**
2. Arrastra estos archivos:
   - `fetch_ecoflow_data.py`
   - `index.html`
   - `requirements.txt`
3. Crea una carpeta `.github/workflows/` y sube:
   - `fetch_data.yml`
4. Clic en **"Commit changes"**

#### **Opción B: Usar Git (si sabes usarlo)**

```bash
git clone https://github.com/TU-USUARIO/ecoflow-monitor.git
cd ecoflow-monitor

# Copiar archivos aquí
# (fetch_ecoflow_data.py, index.html, requirements.txt)
# Crear carpeta .github/workflows/ y copiar fetch_data.yml

git add .
git commit -m "Initial commit"
git push
```

---

### **Paso 3: Configurar GitHub Secrets (CRÍTICO para seguridad)**

🔐 **Aquí es donde guardamos tus credenciales de forma segura:**

1. En tu repositorio, ve a **"Settings"** (pestaña superior)
2. En el menú izquierdo, busca **"Secrets and variables"** → **"Actions"**
3. Clic en **"New repository secret"**
4. Crea estos 2 secretos:

   **Secreto 1:**
   - Name: `ECOFLOW_ACCESS_KEY`
   - Secret: `31E7ypTURljIWrsdLHWjN28XwOaUennA`
   - Clic en "Add secret"

   **Secreto 2:**
   - Name: `ECOFLOW_SECRET_KEY`
   - Secret: `TU_SECRET_KEY_REAL` ⚠️ **CAMBIA "0000" por tu Secret Key real**
   - Clic en "Add secret"

> 🔒 **Importante**: Estos secretos están completamente cifrados y NUNCA aparecen en el código público. Solo GitHub Actions puede leerlos.

---

### **Paso 4: Activar GitHub Pages**

1. Ve a **"Settings"** → **"Pages"** (menú izquierdo)
2. En **"Source"**, selecciona:
   - Branch: `main`
   - Folder: `/ (root)`
3. Clic en **"Save"**
4. Espera 1-2 minutos
5. Refresca la página y verás tu URL:
   ```
   https://TU-USUARIO.github.io/ecoflow-monitor/
   ```

✅ **¡Tu web ya está lista!**

---

### **Paso 5: Ejecutar la primera vez (manual)**

Para iniciar la recopilación de datos:

1. Ve a la pestaña **"Actions"** en tu repositorio
2. Verás el workflow **"Fetch EcoFlow Data"**
3. Clic en él, luego clic en **"Run workflow"** → **"Run workflow"**
4. Espera 30 segundos
5. Si todo está bien, verás un ✅ verde

Ahora, cada 5 minutos, GitHub Actions ejecutará automáticamente el script.

---

## 📁 Estructura del Proyecto

```
ecoflow-monitor/
├── .github/
│   └── workflows/
│       └── fetch_data.yml          # Configuración de GitHub Actions
├── data/
│   └── ecoflow_history.json        # Datos históricos (se crea automáticamente)
├── fetch_ecoflow_data.py           # Script Python para consultar API
├── index.html                      # Página web con gráficas
├── requirements.txt                # Dependencias Python
└── README.md                       # Esta guía
```

---

## ⚙️ Configuración

### **Agregar nuevos dispositivos**

Edita `fetch_ecoflow_data.py`, líneas 19-44:

```python
DEVICES = [
    {
        "name": "DELTA 2 Max Principal",
        "sn": "R351ZAB5PGAW0684",
        "type": "delta2max",
        "always_online": True
    },
    {
        "name": "RIVER 2 Max Solar",
        "sn": "R611ZAB6XGBQ0739",
        "type": "river2max",
        "always_online": True
    },
    # ⬇️ AGREGAR NUEVOS DISPOSITIVOS AQUÍ ⬇️
    {
        "name": "RIVER 2 Max Beneficiario 1",
        "sn": "R611ZAB6XGBQ9999",
        "type": "river2max",
        "always_online": False  # Este no tiene WiFi constante
    },
]
```

### **Cambiar el umbral de batería baja (alerta roja)**

**Opción 1 - En la web (JavaScript):**
Edita `index.html`, línea ~248:

```javascript
const LOW_BATTERY_THRESHOLD = 15; // Cambia 15 por el valor que quieras
```

**Opción 2 - En el CSS:**
Edita `index.html`, línea ~125:

```css
/* MODIFICAR AQUÍ EL UMBRAL DE BATERÍA BAJA */
.battery-low {
    color: #ff4444 !important;
}
```

### **Cambiar frecuencia de actualización**

Edita `.github/workflows/fetch_data.yml`, línea 5:

```yaml
- cron: '*/5 * * * *'  # Cada 5 minutos
```

Opciones:
- `*/5 * * * *` = cada 5 minutos
- `*/10 * * * *` = cada 10 minutos
- `*/15 * * * *` = cada 15 minutos
- `0 * * * *` = cada hora

---

## 🔒 Seguridad de Credenciales

### ❌ **Nunca hagas esto:**
```python
ACCESS_KEY = "31E7ypTURljIWrsdLHWjN28XwOaUennA"  # ¡MAL!
SECRET_KEY = "mi_password_secreta"               # ¡MAL!
```

### ✅ **Siempre usa GitHub Secrets:**
```python
ACCESS_KEY = os.environ.get("ECOFLOW_ACCESS_KEY", "")  # ✅ BIEN
SECRET_KEY = os.environ.get("ECOFLOW_SECRET_KEY", "")  # ✅ BIEN
```

**¿Por qué es seguro?**
1. Las credenciales están en GitHub Secrets (cifradas)
2. Solo GitHub Actions puede leerlas
3. NUNCA aparecen en el código público
4. NUNCA están en la web (solo datos procesados)

---

## 🌐 Acceso a la Web

Tu monitor estará disponible públicamente en:
```
https://TU-USUARIO.github.io/ecoflow-monitor/
```

**Características de seguridad:**
- ✅ Cualquiera puede ver las gráficas
- ✅ Nadie puede ver tus credenciales
- ✅ Nadie puede modificar tus datos (solo tú con acceso al repo)
- ✅ Los datos se actualizan cada 5 minutos automáticamente

---

## 📊 Datos que se registran

Para cada dispositivo, cada 5 minutos:

| Dato | Descripción | Unidad |
|------|-------------|--------|
| `battery_percent` | Porcentaje de batería | % (0-100) |
| `solar_input_w` | Entrada solar actual | Watts (W) |
| `total_output_w` | Salida total actual | Watts (W) |
| `design_capacity_wh` | Capacidad total diseñada | Wh |
| `remaining_capacity_wh` | Capacidad restante | Wh |
| `online` | Estado de conexión | true/false |
| `timestamp` | Fecha y hora | ISO 8601 |

---

## 🔧 Solución de Problemas

### **El workflow falla con error 401**
- Verifica que los Secrets estén configurados correctamente
- Asegúrate de usar tu Secret Key real (no "0000")

### **No aparecen datos en la web**
- Verifica que el workflow se haya ejecutado al menos una vez
- Revisa que exista el archivo `data/ecoflow_history.json` en el repo
- Espera 5 minutos después de la primera ejecución

### **Un dispositivo no aparece**
- Verifica que el Serial Number (sn) sea correcto
- Si el dispositivo está offline, aparecerá cuando se reconecte
- Revisa los logs en "Actions" para ver errores específicos

### **Las gráficas no se actualizan**
- Refresca la página (Ctrl+F5 o Cmd+Shift+R)
- Verifica que GitHub Actions esté ejecutándose cada 5 minutos
- Revisa la última fecha de modificación del archivo JSON

---

## 🎯 Dispositivos con WiFi intermitente

Si tienes dispositivos que no están siempre conectados:

1. En `fetch_ecoflow_data.py`, marca como `always_online: False`
2. El script intentará obtener datos cada 5 minutos
3. Si está offline, se salta sin error
4. Cuando se reconecte, se registrarán los datos automáticamente
5. Las gráficas mostrarán "huecos" en los períodos sin conexión

**Ejemplo:**
```python
{
    "name": "RIVER 2 Max Remoto",
    "sn": "R611ZAB6XGBQ1234",
    "type": "river2max",
    "always_online": False  # ⬅️ Este dispositivo se conecta ocasionalmente
}
```

---

## 📱 Acceso desde móvil

La web es responsive y funciona perfectamente en:
- 📱 Smartphones (Android, iOS)
- 💻 Tablets
- 🖥️ Ordenadores

Simplemente abre la URL en cualquier navegador.

---

## 🔄 Actualización Manual

Si quieres forzar una actualización inmediata:

1. Ve a la pestaña **"Actions"**
2. Selecciona **"Fetch EcoFlow Data"**
3. Clic en **"Run workflow"**
4. Espera 30 segundos
5. Refresca tu web

---

## 📈 Retención de Datos

- Se guardan hasta **90 días** de historial
- Aproximadamente **25,920 lecturas** por dispositivo
- Después de 90 días, se eliminan automáticamente las más antiguas
- Si necesitas más tiempo, modifica línea 134 en `fetch_ecoflow_data.py`

---

## 🆘 Soporte

Si tienes problemas:

1. Revisa los logs en "Actions"
2. Verifica que los Secrets estén configurados
3. Asegúrate de que tu Access Key esté activa en EcoFlow
4. Comprueba que los Serial Numbers sean correctos

---

## 📜 Licencia

Proyecto de código abierto. Libre para usar y modificar.

---

## 🎉 ¡Listo!

Tu sistema de monitoreo está completo. Cada 5 minutos:
1. GitHub Actions ejecuta el script
2. Consulta la API de EcoFlow
3. Guarda los datos en JSON
4. La web se actualiza automáticamente

**URL de tu monitor:**
```
https://TU-USUARIO.github.io/ecoflow-monitor/
```

¡Disfruta monitoreando tus EcoFlow! 🔋☀️⚡
