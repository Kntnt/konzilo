# Typesense, the vendor's image (ADR 0053, ADR 0005), with a folder for its data that a user
# other than root owns, since a volume takes its first owner from the folder it is mounted on,
# and the vendor's runs as root.

ARG TYPESENSE
ARG TYPESENSE_DIGEST

FROM typesense/typesense:${TYPESENSE}@sha256:${TYPESENSE_DIGEST}
RUN mkdir /data /secret && chown 1000:1000 /data /secret
USER 1000:1000
