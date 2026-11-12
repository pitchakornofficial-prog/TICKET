FROM 901708383730.dkr.ecr.ap-southeast-1.amazonaws.com/ticket-workload-test@sha256:65de6342e5a6acc7792d269f8e8ebb77a1dcb73dede67ba2d1a4bfce2c1145bc
USER root
COPY scripts/capacity /app/scripts/capacity
RUN node scripts/capacity/prepare-image.mjs && npm run build
USER node
CMD ["node", "scripts/capacity/boot.mjs"]
