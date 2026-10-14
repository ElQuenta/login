---
name: flujo-calidad
description: Coordina desarrollo e integración entre MongoDB, backend Node.js, frontend React y pruebas unitarias Jest mediante subagentes. Úsala para trabajo entre capas o para ejecutar el flujo completo de calidad y hooks; no para explicar código o realizar un cambio aislado.
---

Actúa como orquestador de los agentes definidos en `.codex/agents/`. Adapta el
flujo a la funcionalidad solicitada y al proyecto existente; no lo limites al login.
Los subagentes no se llaman entre sí: tú compartes sus contratos y resultados.

## Delegación

Revisa estructura, scripts, contratos y cambios existentes. Asigna archivos
concretos y criterios de aceptación a cada agente. Indica que comparte el
repositorio y debe respetar las ediciones ajenas.

| Agente | Responsabilidad | Entrega |
|---|---|---|
| `db-dev` | Persistencia, Compose, colecciones, índices y seeds | Variables, esquemas y conectividad comprobada |
| `backend-dev` | API, reglas de negocio y correcciones de producción | Endpoints, contratos y casos de error |
| `backend-test-dev` | Configuración Jest, mocks y pruebas unitarias | Escenarios cubiertos y resultados |
| `frontend-dev` | Pantallas, componentes y consumo de API | Flujos y estados de interfaz comprobados |

Ejecuta solo las etapas necesarias. Respeta dependencias: persistencia antes de
integración backend; contratos backend antes del cliente y sus pruebas. Frontend
y tests pueden avanzar en paralelo con contratos estables y propietarios
distintos. Serializa cambios de package.json y lockfile.

## Pruebas y reparación

1. Encarga a `backend-test-dev` las unidades y escenarios relevantes. Conserva
   las pruebas de integración; Jest usa `back/tests/unit/` sin necesitar MongoDB.
2. Si la tarea requiere editar tests o configuración protegida, inicia la sesión
   explícitamente con `CODEX_ALLOW_TEST_EDITS=1`, según la [referencia de
   automatización](references/automation.md). No habilites esa excepción como
   reacción a una prueba fallida. Revisión y autofix la mantienen desactivada.
3. Ejecuta desde la raíz `python .codex/hooks/quality.py review`: compila backend
   y ejecuta Jest. `--integration` añade seed e integración contra una base de
   pruebas configurada, nunca una base de producción.
4. Si falla, distingue defecto del producto, del test o del entorno.
   `python .codex/hooks/quality.py fix` realiza un intento aislado e incorpora
   solo cambios TypeScript de `back/src/` que pasan los tests originales.
   Para infraestructura, dependencias o cambios de contrato, delega al agente
   responsable. No debilites tests ni fuerces correcciones incorrectas.
5. No repitas automáticamente el mismo intento fallido. Reporta diagnóstico y
   bloqueo. Los hooks limitan la reparación por turno y evitan recursión.

## Verificación y entrega

Comprueba la integración de las capas modificadas y el build frontend si cambió.
No avances sobre dependencias críticas fallidas ni deduzcas que una API funciona
porque pasan sus tests con mocks.

Reporta por etapa: agente, archivos, comprobaciones ejecutadas, resultado y
limitaciones. Incluye comandos, contratos modificados y fallos pendientes.
Distingue pruebas unitarias, integración real y CI. Para configuración de hooks,
protección, autofix y GitHub Actions, lee [references/automation.md](references/automation.md).
