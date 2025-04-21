FROM node:18-slim

WORKDIR /app

# 1) Install Graph CLI globally
RUN npm install -g @graphprotocol/graph-cli

# 2) Copy and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 3) Copy the rest of the subgraph
COPY . .

# 4) Build the subgraph
RUN graph codegen && graph build

# 5) Deploy to your Graph Node (adjust host if needed)
CMD ["graph", "deploy", "A5DPRINTERLLC/v2-subgraph", "subgraph.yaml", "--node", "http://host.docker.internal:8020", "--ipfs", "http://host.docker.internal:5001", "--version-label", "v0.0.1"]