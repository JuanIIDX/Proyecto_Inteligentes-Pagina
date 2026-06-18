import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SolicitudesService } from './solicitudes.service';
import { FormularioSolicitud, Modo, ModoInfo, ResultadoSolicitud, Solicitud } from './models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private svc = inject(SolicitudesService);

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

  form: FormularioSolicitud = { asunto: '', descripcion: '', solicitante: '' };

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

  async cambiarModo(modo: Modo): Promise<void> {
    this.modo = modo;
    // Resetea estado dependiente del modo
    this.resultado = null;
    this.error = null;
    this.optimizacion = null;
    this.errorOptimizacion = null;
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
}
