# ============================================================
# Dockerfile en la raíz del repo
# Build del bot desde la subcarpeta 'agente quimica dec'
# ============================================================

# Stage 1: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

# Copiar archivos de dependencias desde la subcarpeta
COPY ["agente quimica dec/package*.json", "./"]
COPY ["agente quimica dec/tsconfig.json", "./"]
RUN npm install

# Copiar el código fuente
COPY ["agente quimica dec/src", "./src"]

# Compilar TypeScript → dist/
RUN npm run build

# ============================================================
# Stage 2: Imagen de producción (liviana)
# ============================================================
FROM node:20-alpine
WORKDIR /app

COPY ["agente quimica dec/package*.json", "./"]
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

# Copiar archivos de conocimiento a / (el bot los busca con path.resolve('../...') desde /app)
COPY ["system_instruction_dani.md", "/"]
COPY ["productos_muestra_asistente_ia.md", "/"]

CMD ["node", "dist/index.js"]
