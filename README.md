# Sistema Inteligente de Solicitudes Universitarias (Angular)

App Angular con un navbar que permite alternar entre **tres modos de backend** sobre
el mismo formulario e historial de solicitudes:

| Modo | Backend | Endpoints |
|------|---------|-----------|
| **Local** | FastAPI local | `http://127.0.0.1:8000` — `POST /solicitudes`, `GET /solicitudes`, `POST /optimizar-asignaciones` |
| **N8N** | Webhooks n8n.cloud | `POST` y `GET` a los webhooks configurados |
| **Langchain** | Azure App Service | mismo contrato que Local, desplegado en Azure |

Local y Langchain comparten el contrato REST (campos `descripcion`, `responsable`,
prioridad textual `Alta/Media/Baja` y búsqueda **A\*** de optimización). N8N usa
`body` en lugar de `descripcion`, devuelve `dependencia` y prioridad numérica 1-5,
y no tiene optimización A\*. Todo se normaliza en `src/app/solicitudes.service.ts`.

## Cómo correr

```bash
npm install      # solo la primera vez
npm start        # servidor de desarrollo en http://localhost:4200
npm run build    # build de producción en dist/
```

## Dónde cambiar los endpoints

Edita el objeto `CONFIG` al inicio de [`src/app/solicitudes.service.ts`](src/app/solicitudes.service.ts).

> Nota: el modo **Local** apunta a `127.0.0.1:8000`; arranca tu FastAPI con CORS
> habilitado para `http://localhost:4200`. Para N8N/Langchain los servicios deben
> permitir peticiones desde el navegador (CORS).
