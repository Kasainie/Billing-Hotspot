FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node agent.mjs backup-policy.mjs router-script-source.mjs ./

USER node
CMD ["node", "/app/agent.mjs"]
