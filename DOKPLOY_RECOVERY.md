# 🆘 DOKPLOY SUPERADMIN RECOVERY GUIDE

## Problema Actual
```
❌ 401 Unauthorized en login
📧 Email: admin@kenya.com
🔑 Password: Kenya2024!
```

El sistema detectó que la contraseña del superadmin es **INCORRECTA EN LA BASE DE DATOS**.

---

## ✅ OPCIÓN 1: Auto-Reparación Automática (RECOMENDADA - 30 seg)

**PASOS:**

1. **En Dokploy Dashboard:**
   - Ir a **Applications** → **Cotizador_2.0 Backend**
   - Click en **Redeploy**
   - Esperar a que termine (2-3 minutos)

2. **Verificar en Logs:**
   - Dashboard → **Logs**
   - Buscar: `✅ SUPERADMIN PASSWORD CORREGIDO`
   - Si lo ves, el problema está resuelto ✅

3. **Probar Login:**
   ```
   Email: admin@kenya.com
   Password: Kenya2024!
   ```
   Si funciona → ¡LISTO! 🎉

---

## ✅ OPCIÓN 2: Endpoint de Rescate (SIN redeploy - 10 segundos)

**REQUISITO:** La variable `ADMIN_INIT_SECRET` debe estar configurada en Dokploy

**PASOS:**

1. **Verificar variable en Dokploy:**
   - Dashboard → **Applications** → **Backend**
   - **Environment** (o Settings)
   - Buscar `ADMIN_INIT_SECRET`
   - Si NO EXISTE, aún necesitas hacer redeploy del commit actual primero

2. **Una vez configurada, ejecutar en terminal:**
   ```bash
   curl -X POST https://cotizador.abadgroup.tech/api/admin/init-superadmin \
     -H "Content-Type: application/json" \
     -d '{
       "secret": "el-valor-de-ADMIN_INIT_SECRET"
     }'
   ```

3. **Respuesta esperada:**
   ```json
   {
     "ok": true,
     "message": "Superadmin actualizado",
     "email": "admin@kenya.com",
     "password": "Kenya2024!"
   }
   ```

4. **Probar login inmediatamente**

---

## ✅ OPCIÓN 3: Node Script en Terminal Dokploy

**PASOS:**

1. En Dokploy Dashboard:
   - **Applications** → **Cotizador_2.0 Backend**
   - **Terminal** o **SSH**

2. Ejecutar:
   ```bash
   cd /app/backend
   npm run seed:prod
   ```

3. Logs esperados:
   ```
   ✅ Conectado a PostgreSQL
   ✅ Migración ejecutada: 001_initial.sql
   ✅ Migración ejecutada: 002_auth.sql
   ✅ Superadmin creado o actualizado
   ```

---

## ✅ OPCIÓN 4: Update Manual en Base de Datos

**PASOS:**

1. Conecta a PostgreSQL desde Dokploy o herramienta externa (DBeaver, pgAdmin)

2. Ejecuta este comando SQL:
   ```sql
   -- Generar nuevo hash
   SELECT crypt('Kenya2024!', gen_salt('bf', 10)) as new_hash;
   ```
   Copia el resultado (algo como `$2b$10$...`)

3. Ejecuta:
   ```sql
   UPDATE users 
   SET password_hash = '<pega-el-hash-aqui>'
   WHERE email = 'admin@kenya.com';
   ```

4. Verifica:
   ```sql
   SELECT email, rol, password_hash FROM users 
   WHERE email = 'admin@kenya.com';
   ```

---

## 🔍 DIAGNÓSTICO: Verificar Estado Actual

```bash
# Ver si superadmin existe y su estado
curl https://cotizador.abadgroup.tech/api/health | jq .superadmin
```

Respuesta esperada:
```json
{
  "exists": true,
  "email": "admin@kenya.com",
  "role": "superadmin",
  "valid": true,
  "message": "OK"
}
```

Si `valid: false`, significa que el hash sigue siendo incorrecto.

---

## 📝 Próximos Pasos Después del Login

1. Cambiar la contraseña del superadmin
2. Revisar el dashboard de admin
3. Verificar migraciones ejecutadas
4. Confirmar que la BD está poblada

---

## ⚠️ PREGUNTAS COMUNES

### ¿Es normal que el contenedor no se "actualice"?
**SÍ.** Los contenedores Docker no actualizan automáticamente la base de datos. Necesitas:
- Hacer **redeploy** del código actualizado, O
- Ejecutar manualmente los scripts de seeding

### ¿Por qué el hash está mal en BD?
Posibles causas:
1. Migración ejecutada pero con datos corruptos
2. Base de datos restaurada de backup antiguo
3. Hash generado con configuración diferente de bcrypt

### ¿Qué pasa si cambio la contraseña?
Se genera un nuevo hash bcrypt automáticamente en la próxima vez que cambies la contraseña.

---

## 🚀 Push a Producción

El commit **5bf148f** incluye:
- ✅ Corrección automática de password hash en startup
- ✅ Endpoint `/api/admin/init-superadmin` para rescate
- ✅ Health endpoint mejorado con estado de superadmin
- ✅ Logs más detallados para debugging

**Ya está en GitHub.** Solo necesitas hacer **redeploy** en Dokploy.

