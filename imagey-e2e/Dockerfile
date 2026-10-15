# Runtime image for the E2E suite. Unlike the root Dockerfile it does not build anything: the
# bundle comes from the Maven reactor (imagey-server/target) and no test data is copied, so the
# server starts with an empty root.path.
FROM eclipse-temurin:17-jre
WORKDIR /app

RUN apt-get update && apt-get install -y unzip curl && rm -rf /var/lib/apt/lists/*

COPY imagey-server-meecrowave-distribution.zip imagey-web-coverage.jar ./

# The imagey-web jar is replaced by the same frontend, instrumented for the coverage of the suite
RUN unzip imagey-server-meecrowave-distribution.zip && \
    rm imagey-server-meecrowave-distribution.zip && \
    mv -f imagey-web-coverage.jar imagey-server-distribution/lib/imagey-web-*.jar && \
    chmod +x imagey-server-distribution/bin/meecrowave.sh

EXPOSE 8080

CMD ["./imagey-server-distribution/bin/meecrowave.sh", "run"]
