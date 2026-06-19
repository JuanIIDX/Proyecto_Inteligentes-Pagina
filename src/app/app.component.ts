import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { SolicitudesService } from './solicitudes.service';
import {
  ComparacionTecnicas,
  FormularioSolicitud,
  Modo,
  ModoInfo,
  RagBusqueda,
  RagDocumento,
  RagRespuesta,
  ResultadoSolicitud,
  Solicitud,
} from './models';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, AfterViewChecked {
  private svc = inject(SolicitudesService);

  @ViewChild('chartCosto') chartCosto?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartEsfuerzo') chartEsfuerzo?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartTiempo') chartTiempo?: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartConvergencia') chartConvergencia?: ElementRef<HTMLCanvasElement>;

  modos: ModoInfo[] = [
    {
      id: 'local',
      nombre: 'Local',
      descripcion: 'FastAPI en tu máquina',
      icono:
        '<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z"/><path d="M8 21h8M12 16v5"/>',
    },
    {
      id: 'n8n',
      nombre: 'N8N',
      descripcion: 'Automatización por webhooks',
      icono:
        '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 6h4a2 2 0 0 1 2 2v1M9 18h4a2 2 0 0 0 2-2v-1"/>',
    },
    {
      id: 'langchain',
      nombre: 'Langchain',
      descripcion: 'Azure OpenAI en la nube',
      icono:
        '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    },
  ];

  modo: Modo = 'local';

  /** Cuando es true se muestra el panel "Configurar RAG" en lugar de los modos. */
  vistaRag = false;

  form: FormularioSolicitud = { asunto: '', descripcion: '', solicitante: '' };

  // ── Estado del panel RAG ──
  ragDocumentos: RagDocumento[] = [];
  ragCargandoDocs = false;
  ragErrorDocs: string | null = null;

  ragArchivo: File | null = null;
  ragSubiendo = false;
  ragErrorSubida: string | null = null;
  ragResultadoSubida: RagDocumento | null = null;

  ragQuery = '';
  ragK: number | null = 3;
  ragBuscando = false;
  ragBusqueda: RagBusqueda | null = null;
  ragErrorBusqueda: string | null = null;

  ragPregunta = '';
  ragPreguntando = false;
  ragRespuesta: RagRespuesta | null = null;
  ragErrorPregunta: string | null = null;

  conexionEstado: 'verificando' | 'ok' | 'error' = 'verificando';
  enviando = false;
  cargandoHistorial = false;
  optimizando = false;

  resultado: ResultadoSolicitud | null = null;
  error: string | null = null;
  historial: Solicitud[] = [];
  errorHistorial: string | null = null;
  optimizacion: any = null;
  errorOptimizacion: string | null = null;

  comparacion: ComparacionTecnicas | null = null;
  comparando = false;
  errorComparacion: string | null = null;
  /** Flag para (re)dibujar los charts en el próximo ciclo de vista. */
  private redibujarCharts = false;
  private charts: Chart[] = [];

  ngOnInit(): void {
    this.cambiarModo(this.modo);
  }

  get modoActual(): ModoInfo {
    return this.modos.find((m) => m.id === this.modo)!;
  }

  get soportaOptimizacion(): boolean {
    return this.svc.soportaOptimizacion(this.modo);
  }

  get urlConexion(): string {
    return this.svc.urlConexion(this.modo);
  }

  get urlRag(): string {
    return this.svc.urlRag();
  }

  /** Nivel numérico 1–5 a partir de la solicitud (usa prioridadNum o la etiqueta). */
  nivelPrioridad(s: Solicitud): number | null {
    if (s.prioridadNum != null) return Math.min(5, Math.max(1, s.prioridadNum));
    switch (s.prioridad) {
      case 'Alta': return 5;
      case 'Media': return 3;
      case 'Baja': return 1;
      default: return null;
    }
  }

  /** Etiqueta de urgencia legible según el nivel 1–5. */
  etiquetaUrgencia(s: Solicitud): string {
    const n = this.nivelPrioridad(s);
    if (n == null) return '—';
    if (n >= 5) return 'Crítica';
    if (n === 4) return 'Alta';
    if (n === 3) return 'Media';
    if (n === 2) return 'Baja';
    return 'Mínima';
  }

  /** Clase de color (alta/media/baja) según el nivel, para badges y barras. */
  claseNivel(s: Solicitud): 'alta' | 'media' | 'baja' {
    const n = this.nivelPrioridad(s) ?? 0;
    if (n >= 4) return 'alta';
    if (n >= 2) return 'media';
    return 'baja';
  }

  async cambiarModo(modo: Modo): Promise<void> {
    this.vistaRag = false;
    this.modo = modo;
    // Resetea estado dependiente del modo
    this.resultado = null;
    this.error = null;
    this.optimizacion = null;
    this.errorOptimizacion = null;
    this.comparacion = null;
    this.errorComparacion = null;
    this.destruirCharts();
    this.conexionEstado = 'verificando';

    this.svc.verificarConexion(modo).then((ok) => {
      if (this.modo === modo) this.conexionEstado = ok ? 'ok' : 'error';
    });

    await this.cargarHistorial();
  }

  async enviar(): Promise<void> {
    if (this.enviando) return;
    if (!this.form.asunto.trim() || !this.form.descripcion.trim()) {
      this.error = 'Completa el asunto y la descripción.';
      return;
    }
    this.enviando = true;
    this.error = null;
    this.resultado = null;
    try {
      this.resultado = await this.svc.crear(this.modo, {
        asunto: this.form.asunto.trim(),
        descripcion: this.form.descripcion.trim(),
        solicitante: this.form.solicitante?.trim() || null,
      });
      this.form = { asunto: '', descripcion: '', solicitante: '' };
      await this.cargarHistorial();
    } catch (e: any) {
      this.error = e?.message ?? 'Ocurrió un error al enviar la solicitud.';
    } finally {
      this.enviando = false;
    }
  }

  async cargarHistorial(): Promise<void> {
    this.cargandoHistorial = true;
    this.errorHistorial = null;
    try {
      this.historial = await this.svc.listar(this.modo);
    } catch (e: any) {
      this.historial = [];
      this.errorHistorial = e?.message ?? 'No se pudo cargar el historial.';
    } finally {
      this.cargandoHistorial = false;
    }
  }

  async optimizar(): Promise<void> {
    if (this.optimizando) return;
    this.optimizando = true;
    this.errorOptimizacion = null;
    this.optimizacion = null;
    try {
      this.optimizacion = await this.svc.optimizar(this.modo);
      await this.cargarHistorial();
    } catch (e: any) {
      this.errorOptimizacion = e?.message ?? 'No se pudo optimizar.';
    } finally {
      this.optimizando = false;
    }
  }

  trackById(_: number, s: Solicitud) {
    return s.id ?? _;
  }

  // ───────────────────────── RAG ─────────────────────────

  abrirRag(): void {
    this.vistaRag = true;
    this.cargarRagDocumentos();
  }

  ragArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ragArchivo = input.files?.[0] ?? null;
    this.ragErrorSubida = null;
    this.ragResultadoSubida = null;
  }

  async ragSubir(): Promise<void> {
    if (this.ragSubiendo || !this.ragArchivo) return;
    this.ragSubiendo = true;
    this.ragErrorSubida = null;
    this.ragResultadoSubida = null;
    try {
      this.ragResultadoSubida = await this.svc.ragSubirDocumento(this.ragArchivo);
      this.ragArchivo = null;
      await this.cargarRagDocumentos();
    } catch (e: any) {
      this.ragErrorSubida = e?.message ?? 'No se pudo subir el documento.';
    } finally {
      this.ragSubiendo = false;
    }
  }

  async cargarRagDocumentos(): Promise<void> {
    this.ragCargandoDocs = true;
    this.ragErrorDocs = null;
    try {
      this.ragDocumentos = await this.svc.ragListarDocumentos();
    } catch (e: any) {
      this.ragDocumentos = [];
      this.ragErrorDocs = e?.message ?? 'No se pudieron cargar los documentos.';
    } finally {
      this.ragCargandoDocs = false;
    }
  }

  async ragBuscarFragmentos(): Promise<void> {
    if (this.ragBuscando || !this.ragQuery.trim()) return;
    this.ragBuscando = true;
    this.ragErrorBusqueda = null;
    this.ragBusqueda = null;
    try {
      const k = this.ragK != null ? Math.min(20, Math.max(1, this.ragK)) : undefined;
      this.ragBusqueda = await this.svc.ragBuscar(this.ragQuery.trim(), k);
    } catch (e: any) {
      this.ragErrorBusqueda = e?.message ?? 'No se pudo realizar la búsqueda.';
    } finally {
      this.ragBuscando = false;
    }
  }

  async ragPreguntarIA(): Promise<void> {
    if (this.ragPreguntando || !this.ragPregunta.trim()) return;
    this.ragPreguntando = true;
    this.ragErrorPregunta = null;
    this.ragRespuesta = null;
    try {
      this.ragRespuesta = await this.svc.ragPreguntar(this.ragPregunta.trim());
    } catch (e: any) {
      this.ragErrorPregunta = e?.message ?? 'No se pudo obtener la respuesta.';
    } finally {
      this.ragPreguntando = false;
    }
  }

  // ───────────────────────── Comparación de técnicas (SI1) ─────────────────────────

  async compararTecnicas(): Promise<void> {
    if (this.comparando) return;
    this.comparando = true;
    this.errorComparacion = null;
    this.comparacion = null;
    this.destruirCharts();
    try {
      this.comparacion = await this.svc.compararTecnicas(this.modo);
      // Los canvas se renderizan tras este ciclo; pinta los charts después.
      this.redibujarCharts = true;
    } catch (e: any) {
      this.errorComparacion = e?.message ?? 'No se pudo comparar las técnicas.';
    } finally {
      this.comparando = false;
    }
  }

  ngAfterViewChecked(): void {
    if (this.redibujarCharts && this.comparacion && this.chartCosto) {
      this.redibujarCharts = false;
      this.dibujarCharts(this.comparacion);
    }
  }

  /** Aristas del árbol A* (padre → hijo) para pintar las líneas del SVG. */
  aristasAstar(): { x1: number; y1: number; x2: number; y2: number }[] {
    if (!this.comparacion) return [];
    const pos = this.posicionesAstar();
    return this.comparacion.arbol_astar
      .filter((n) => n.padre !== null)
      .map((n) => ({
        x1: pos[n.padre as number].x,
        y1: pos[n.padre as number].y,
        x2: pos[n.id].x,
        y2: pos[n.id].y,
      }));
  }

  /** Posición {x, y} de cada nodo A* en el SVG, por niveles según profundidad. */
  posicionesAstar(): Record<number, { x: number; y: number }> {
    const pos: Record<number, { x: number; y: number }> = {};
    if (!this.comparacion) return pos;
    const nodos = this.comparacion.arbol_astar;
    const profundidad: Record<number, number> = {};
    const porNivel: Record<number, number[]> = {};

    for (const n of nodos) {
      const d = n.padre === null ? 0 : (profundidad[n.padre] ?? 0) + 1;
      profundidad[n.id] = d;
      (porNivel[d] ??= []).push(n.id);
    }

    const sepX = 150;
    const sepY = 110;
    const margen = 60;
    for (const nivelStr of Object.keys(porNivel)) {
      const nivel = Number(nivelStr);
      const ids = porNivel[nivel];
      ids.forEach((id, i) => {
        pos[id] = { x: margen + i * sepX, y: margen + nivel * sepY };
      });
    }
    return pos;
  }

  anchoSvgAstar(): number {
    const pos = Object.values(this.posicionesAstar());
    if (!pos.length) return 400;
    return Math.max(400, Math.max(...pos.map((p) => p.x)) + 80);
  }

  altoSvgAstar(): number {
    const pos = Object.values(this.posicionesAstar());
    if (!pos.length) return 200;
    return Math.max(200, Math.max(...pos.map((p) => p.y)) + 60);
  }

  private destruirCharts(): void {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
  }

  private dibujarCharts(data: ComparacionTecnicas): void {
    this.destruirCharts();
    const nombres = data.tecnicas.map((t) => t.nombre);
    const colores = ['#2563eb', '#16a34a', '#f59e0b', '#a855f7'];
    const etiquetaEsfuerzo = data.tecnicas[0]?.esfuerzo_etiqueta ?? 'esfuerzo';

    const barra = (
      ref: ElementRef<HTMLCanvasElement> | undefined,
      label: string,
      valores: number[],
    ) => {
      if (!ref) return;
      this.charts.push(
        new Chart(ref.nativeElement, {
          type: 'bar',
          data: {
            labels: nombres,
            datasets: [{ label, data: valores, backgroundColor: colores, borderRadius: 6 }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: label } },
            scales: { y: { beginAtZero: true } },
          },
        }),
      );
    };

    barra(this.chartCosto, 'Costo total', data.tecnicas.map((t) => t.costo_total));
    barra(this.chartEsfuerzo, `Esfuerzo (${etiquetaEsfuerzo})`, data.tecnicas.map((t) => t.esfuerzo));
    barra(this.chartTiempo, 'Tiempo de ejecución (ms)', data.tecnicas.map((t) => t.tiempo_ejecucion_ms));

    if (this.chartConvergencia) {
      this.charts.push(
        new Chart(this.chartConvergencia.nativeElement, {
          type: 'line',
          data: {
            labels: data.convergencia_genetico.map((_, i) => i + 1),
            datasets: [
              {
                label: 'Costo del mejor individuo',
                data: data.convergencia_genetico,
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168, 85, 247, .15)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { title: { display: true, text: 'Convergencia del algoritmo genético' } },
            scales: {
              x: { title: { display: true, text: 'Generación' } },
              y: { title: { display: true, text: 'Costo' } },
            },
          },
        }),
      );
    }
  }
}
