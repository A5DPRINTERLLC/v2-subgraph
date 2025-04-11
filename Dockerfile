FROM node:18-slim

WORKDIR /app

# 1) Install Graph CLI globally
RUN npm install -g @graphprotocol/graph-cli

# 2) Copy and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 3) Copy the rest of the subgraph code
COPY . .

# 4) Build the subgraph
RUN graph codegen && graph build

# 5) Optional runtime command
CMD ["sh", "-c", "echo '✅ Subgraph build complete. Use docker run -it <image> /bin/sh to explore output.'"]