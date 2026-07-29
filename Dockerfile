# Usar Node.js 22 Alpine (soporta WebSocket nativo requerido por @supabase/supabase-js)
FROM node:22-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar dependencias y package.json
COPY package*.json ./

# Instalación de dependencias en producción
RUN npm install --omit=dev

# Copiar el código fuente
COPY . .

# Puerto de la API
EXPOSE 3000

# Comando de inicio
CMD ["node", "server.js"]
