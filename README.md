# Escalamientos ATM

Aplicación de escritorio para gestionar escalamientos de fallas en ATMs. Permite procesar datos pegados desde Excel, generar correos en Outlook, crear scripts de tickets y registrar incidentes XOLUSAT.

---

## Requisitos

- **Python 3.10 o superior** — [Descargar](https://www.python.org/downloads/)  
  ⚠️ Al instalar, marcar la opción **"Add Python to PATH"**
- **Microsoft Outlook** instalado y configurado (para envío de correos)
- **Windows 10 / 11**
- **Google Chrome o Microsoft Edge** (versión 2022 o posterior)

---

## Instalación

1. Descomprimí el ZIP en cualquier carpeta (ej: `C:\Apps\EscalamientosApp`)
   > ⚠️ **Nota:** Al extraer desde GitHub, el ZIP crea una carpeta `EscalamientosApp-main` que contiene **otra** carpeta `EscalamientosApp-main`. Los archivos de la app están en la carpeta **interior**. Entrá a esa carpeta antes de continuar.
2. Doble clic en **`iniciar.bat`**
3. La primera vez instala dependencias automáticamente (puede demorar 1-2 minutos)
4. La aplicación se abre en el navegador en `http://localhost:5000`

> Se crea un acceso directo en el Escritorio automáticamente en la primera ejecución.

---

## Uso diario

| Acción | Cómo |
|--------|------|
| Iniciar la app | Doble clic en `iniciar.bat` o en el acceso directo del Escritorio |
| Cerrar la app | Botón **"Cerrar servidor"** en el sidebar, o `detener_servidor.bat` |
| Pegar fallas | Seleccioná las celdas en Excel (con encabezados), Ctrl+C, pegá en el área de texto |
| Actualizar planilla RCU | Botón "Seleccionar archivo" en el sidebar → elegí el `.xlsx` nuevo |

---

## Métricas de escalamiento

La app mide automáticamente cuánto tarda cada etapa del proceso por ticket:

| Etapa | Cómo se mide |
|-------|-------------|
| **Correos / ATM** | Tiempo total de envío ÷ cantidad de ATMs |
| **Scripts / TK** | Tiempo total de generación ÷ cantidad de tickets |
| **Vision / TK** | Medido individualmente — al terminar de documentar cada ticket en Vision, hacé clic en el botón **✓** que aparece en el tab Scripts |

**Flujo de medición:**
1. Procesá los datos → el timer arranca automáticamente
2. Enviá los correos → se registra el tiempo de esa etapa
3. Generá los scripts → aparece un botón **✓** por cada ticket
4. Documentá cada ticket en Vision → volvé a la app y hacé clic en **✓** de ese ticket
5. Al marcar el último → la sesión se guarda automáticamente

Los resultados se ven en el tab **Métricas**: promedios por etapa, tiempo por ticket, gráficos y el historial completo de sesiones.

> Con 4-5 sesiones registradas ya tenés suficiente data para definir tu tiempo estándar por ticket.

---

## Estructura del proyecto

```
EscalamientosApp-1.1/
├── iniciar.bat                  # Inicia el servidor y abre el navegador
├── detener_servidor.bat         # Detiene el servidor
├── README.md                    # Este archivo
├── .gitignore
└── backend/
    ├── app.py                   # Servidor Flask (API REST)
    ├── excel_handler.py         # Lectura/escritura de la planilla Excel
    ├── outlook_handler.py       # Integración con Outlook via COM
    ├── requirements.txt         # Dependencias Python
    ├── PlanillaEscalamientos.xlsx   # Base de datos (no se sube a git)
    ├── xolusat_records.json     # Registros XOLUSAT persistidos (no se sube a git)
    ├── metricas_sesiones.json   # Historial de métricas (no se sube a git)
    ├── templates/
    │   └── index.html           # Interfaz web (SPA)
    └── static/
        ├── style.css            # Estilos
        └── script.js            # Lógica del frontend
```

---

## Pantallas / Resolución

La app está optimizada para funcionar en pantallas con escala de Windows al **100%, 125% y 150%**. Si usás monitor externo, la interfaz se reajusta automáticamente al conectarlo.

---

## Solución de problemas

**La app no abre en el navegador:**
- Verificar que Python esté instalado y en el PATH
- Ejecutar `iniciar.bat` con clic derecho → "Ejecutar como administrador"

**No se pueden enviar correos:**
- Verificar que Outlook esté abierto y configurado con una cuenta activa

**El servidor ya estaba corriendo al iniciar:**
- Usar `detener_servidor.bat` primero, luego `iniciar.bat`

**Los datos de XOLUSAT se perdieron:**
- Los registros se guardan en `backend/xolusat_records.json`. Si el archivo fue eliminado, los datos no se pueden recuperar.

**Las métricas no aparecen en el tab Métricas:**
- Asegurate de completar el flujo completo (procesar → correos → scripts → marcar ✓ en Vision). Las sesiones incompletas no se guardan.
- Los datos se guardan en `backend/metricas_sesiones.json`.
