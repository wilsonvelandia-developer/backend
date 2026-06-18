# Changelog — main

## [No publicado]

### Agregado
- Se expandió la tabla `users` con campos de perfil completo: primer nombre, segundo nombre, primer apellido, segundo apellido, tipo de documento, fecha de nacimiento, foto de perfil, fotos de documento (frente/reverso), archivo EPS
- Se crearon endpoints REST completos para gestión de usuarios: `GET /api/users`, `GET /api/users/:id`, `PUT /api/users/:id`, `DELETE /api/users/:id`
- Se actualizó el endpoint `POST /auth/register` para aceptar los nuevos campos de perfil
- Se implementó formulario completo de usuario en el frontend con secciones: datos personales, documento de identidad, contacto/acceso, seguridad social y roles
- Se agregó modo edición al formulario de usuario (`/users/:id/edit`)
- Se agregaron botones de editar y eliminar (desactivar) en el listado de usuarios
- Se expandió la tabla `teams` con campos de perfil: phone, email, redes sociales (Instagram, Facebook, TikTok, YouTube), status, colores (primario/secundario), variant
- Se creó tabla `tournament_enrollments` para relación muchos-a-muchos equipo ↔ torneo (equipos reutilizables)
- Se hizo `tournament_id` nullable en `teams` (un equipo sin torneo es un club independiente reutilizable)
- Se actualizó el formulario de equipos con todas las secciones: datos, colores, contacto, redes sociales
- Se actualizó el listado de equipos para mostrar variante, colores, estado y contacto

### Cambiado
- Se refactorizó el servicio de usuarios del frontend para usar los nuevos endpoints (getAll, getById, update, delete)
- Se actualizó el listado de usuarios para mostrar tipo/número de documento y teléfono

### Corregido
- Se corrigió la ruta `GET /tournaments/:id/groups` que estaba duplicada como POST en el router de torneos
- Se agregaron los campos `pointsConfig`, `tiebreakerCriteria`, `initialFairPlayScore`, `teamsPerGroupQualify` al columnMap del update de torneos (antes se ignoraban)
- Se implementó la persistencia completa de copas y sanciones desde el formulario de torneo (carga en edición + guardado post-submit)
