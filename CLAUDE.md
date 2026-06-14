@AGENTS.md

## Mantenimiento

### Fotos huérfanas en Storage

`/api/etiquetar` sube la foto **antes** de que exista la fila en `prendas`. Si el usuario cierra la pestaña o falla la red entre ambos pasos, el archivo queda huérfano.

`pg_cron` no está habilitado en el proyecto (`exxcgaikbjfojpfpiocj`). La limpieza se hace on-demand via la server action `limpiarFotosHuerfanas` en `app/closet/actions.ts`.

**Cómo dispararla:**

```typescript
import { limpiarFotosHuerfanas } from '@/app/closet/actions'
const { deleted, error } = await limpiarFotosHuerfanas()
```

- Solo borra archivos del usuario autenticado (no es admin-global).
- Solo borra archivos **sin fila en `prendas`** y con antigüedad **> 24 h** — los uploads en vuelo no se tocan.
- Límite: 1 000 archivos por llamada. Para clósets muy grandes, paginar con `list(..., { offset })`.
