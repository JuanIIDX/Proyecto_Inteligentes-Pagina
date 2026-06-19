export type Modo = 'local' | 'n8n' | 'langchain';

/** Datos que el usuario llena en el formulario (común a todos los modos). */
export interface FormularioSolicitud {
  asunto: string;
  descripcion: string;
  solicitante?: string | null;
}

/** Solicitud normalizada que la UI sabe mostrar, venga del backend que venga. */
export interface Solicitud {
  id?: number | string | null;
  asunto?: string | null;
  descripcion?: string | null;
  categoria?: string | null;
  /** Dependencia / responsable que atiende la solicitud. */
  responsable?: string | null;
  /** Prioridad textual normalizada: Alta | Media | Baja. */
  prioridad?: 'Alta' | 'Media' | 'Baja' | null;
  /** Prioridad numérica original (1-5) si el backend la entrega (n8n). */
  prioridadNum?: number | null;
  estado?: string | null;
  razonamiento?: string | null;
  fecha?: string | null;
}

/** Resultado inmediato tras crear una solicitud. */
export interface ResultadoSolicitud extends Solicitud {}

export interface ModoInfo {
  id: Modo;
  nombre: string;
  descripcion: string;
  /** SVG inline del icono. */
  icono: string;
}

// ───────────────────────── RAG ─────────────────────────

/** Documento indexado en el RAG. */
export interface RagDocumento {
  fuente: string;
  fragmentos: number;
}

/** Un fragmento recuperado (retrieval). */
export interface RagFragmento {
  contenido: string;
  fuente: string;
  /** Distancia: menor = más parecido. */
  score: number;
}

/** Respuesta de búsqueda (retrieval puro). */
export interface RagBusqueda {
  consulta: string;
  fragmentos: RagFragmento[];
}

/** Respuesta de la IA con contexto RAG. */
export interface RagRespuesta {
  pregunta: string;
  respuesta: string;
  fuentes: string[];
}

// ───────────────────────── Comparación de técnicas (SI1) ─────────────────────────

export interface TecnicaComparada {
  nombre: string;
  tipo: string;
  costo_total: number;
  esfuerzo: number;
  esfuerzo_etiqueta: string;
  tiempo_ejecucion_ms: number;
  optimo: boolean;
}

export interface NodoAstar {
  id: number;
  padre: number | null;
  indice: number;
  g: number;
  h: number;
  f: number;
}

export interface ComparacionTecnicas {
  num_solicitudes: number;
  tecnicas: TecnicaComparada[];
  arbol_astar: NodoAstar[];
  convergencia_genetico: number[];
}
