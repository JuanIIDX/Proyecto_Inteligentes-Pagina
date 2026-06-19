import { Injectable } from '@angular/core';
import {
  FormularioSolicitud,
  Modo,
  RagBusqueda,
  RagDocumento,
  RagRespuesta,
  ResultadoSolicitud,
  Solicitud,
} from './models';

/** Configuración de endpoints por modo. */
const CONFIG = {
  local: {
    base: 'http://127.0.0.1:8000',
  },
  langchain: {
    base: 'https://solicitudes-ia-ucaldas-etbahkapc6ehgpfm.centralus-01.azurewebsites.net',
  },
  n8n: {
    enviar: 'https://soulking3004x.app.n8n.cloud/webhook/89d35bc1-7a1a-463e-b59f-377099a02ab7',
    consultar: 'https://soulking3004x.app.n8n.cloud/webhook/aeeecd50-fef0-43ef-8b50-a18e8571e7a7',
  },
} as const;

/** Backend contra el que corren los endpoints /rag/* (Azure / Langchain). */
const RAG_BASE = CONFIG.langchain.base;

/** Convierte una prioridad numérica (1-5) o texto a la etiqueta normalizada. */
function normalizarPrioridad(valor: unknown): 'Alta' | 'Media' | 'Baja' | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'string' && isNaN(Number(valor))) {
    const t = valor.trim().toLowerCase();
    if (t.startsWith('alta') || t.startsWith('crít') || t.startsWith('crit')) return 'Alta';
    if (t.startsWith('media') || t.startsWith('norm')) return 'Media';
    if (t.startsWith('baja')) return 'Baja';
    return null;
  }
  const n = Number(valor);
  if (n >= 4) return 'Alta';
  if (n >= 2) return 'Media';
  return 'Baja';
}

@Injectable({ providedIn: 'root' })
export class SolicitudesService {
  // ───────────────────────── API pública ─────────────────────────

  async verificarConexion(modo: Modo): Promise<boolean> {
    try {
      if (modo === 'n8n') {
        // Los webhooks no exponen /health; consideramos OK si responde la consulta.
        const r = await fetch(CONFIG.n8n.consultar, { method: 'GET' });
        return r.ok;
      }
      const base = modo === 'local' ? CONFIG.local.base : CONFIG.langchain.base;
      const r = await fetch(`${base}/health`);
      return r.ok;
    } catch {
      return false;
    }
  }

  async crear(modo: Modo, datos: FormularioSolicitud): Promise<ResultadoSolicitud> {
    return modo === 'n8n' ? this.crearN8n(datos) : this.crearRest(modo, datos);
  }

  async listar(modo: Modo): Promise<Solicitud[]> {
    return modo === 'n8n' ? this.listarN8n() : this.listarRest(modo);
  }

  /** URL a la que se conecta cada modo (para mostrar en la UI). */
  urlConexion(modo: Modo): string {
    if (modo === 'n8n') return CONFIG.n8n.consultar;
    return modo === 'local' ? CONFIG.local.base : CONFIG.langchain.base;
  }

  // ───────────────────────── REST (local + langchain) ─────────────────────────

  private async crearRest(modo: Modo, datos: FormularioSolicitud): Promise<ResultadoSolicitud> {
    const base = modo === 'local' ? CONFIG.local.base : CONFIG.langchain.base;
    const r = await fetch(`${base}/solicitudes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asunto: datos.asunto,
        descripcion: datos.descripcion,
        solicitante: datos.solicitante || null,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return this.mapearRest(data);
  }

  private async listarRest(modo: Modo): Promise<Solicitud[]> {
    const base = modo === 'local' ? CONFIG.local.base : CONFIG.langchain.base;
    const r = await fetch(`${base}/solicitudes?limite=50`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return (Array.isArray(data) ? data : []).map((s) => this.mapearRest(s));
  }

  private mapearRest(s: any): Solicitud {
    return {
      id: s.id,
      asunto: s.asunto,
      descripcion: s.descripcion,
      categoria: s.categoria,
      responsable: s.responsable,
      prioridad: normalizarPrioridad(s.prioridad),
      prioridadNum: typeof s.prioridad === 'number' ? s.prioridad : null,
      estado: s.estado,
      razonamiento: s.razonamiento,
      fecha: s.fecha ?? s.creado_en ?? null,
    };
  }

  // ───────────────────────── N8N (webhooks) ─────────────────────────

  private async crearN8n(datos: FormularioSolicitud): Promise<ResultadoSolicitud> {
    const r = await fetch(CONFIG.n8n.enviar, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // n8n espera { asunto, body }
      body: JSON.stringify({ asunto: datos.asunto, body: datos.descripcion }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();
    const data = Array.isArray(raw) ? raw[0] : raw;
    return this.mapearN8n(data);
  }

  private async listarN8n(): Promise<Solicitud[]> {
    const r = await fetch(CONFIG.n8n.consultar, { method: 'GET' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const raw = await r.json();
    const arr = Array.isArray(raw) ? raw : raw?.data ?? [raw];
    return arr.map((s: any) => this.mapearN8n(s));
  }

  private mapearN8n(s: any): Solicitud {
    const num = parseInt(s?.prioridad, 10);
    return {
      id: s?.id,
      asunto: s?.asunto,
      descripcion: s?.body ?? s?.descripcion,
      categoria: s?.categoria ?? s?.category,
      responsable: s?.dependencia ?? s?.dependency,
      prioridad: normalizarPrioridad(s?.prioridad),
      prioridadNum: isNaN(num) ? null : num,
      estado: s?.estado,
      razonamiento: s?.justificacion ?? s?.justification ?? s?.justificacion_prioridad,
      fecha: s?.fecha ?? null,
    };
  }

  // ───────────────────────── RAG (Azure / Langchain) ─────────────────────────

  /** URL del backend RAG (para mostrar en la UI). */
  urlRag(): string {
    return RAG_BASE;
  }

  /** Sube un documento (.txt o .md) como multipart/form-data. */
  async ragSubirDocumento(archivo: File): Promise<RagDocumento> {
    const fd = new FormData();
    fd.append('archivo', archivo);
    // No fijar Content-Type manualmente: fetch añade el boundary del multipart.
    const r = await fetch(`${RAG_BASE}/rag/documentos`, { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  }

  /** Lista los documentos indexados. */
  async ragListarDocumentos(): Promise<RagDocumento[]> {
    const r = await fetch(`${RAG_BASE}/rag/documentos`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  }

  /** Retrieval puro (sin IA). k es opcional (1–20). */
  async ragBuscar(q: string, k?: number): Promise<RagBusqueda> {
    const params = new URLSearchParams({ q });
    if (k != null) params.set('k', String(k));
    const r = await fetch(`${RAG_BASE}/rag/buscar?${params.toString()}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  }

  /** Pregunta a la IA con contexto RAG. */
  async ragPreguntar(pregunta: string): Promise<RagRespuesta> {
    const r = await fetch(`${RAG_BASE}/rag/preguntar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
    return data;
  }
}
