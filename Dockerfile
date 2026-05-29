# Stage 1: Build Frontend
FROM maven:3.9-eclipse-temurin-17 AS frontend-builder
WORKDIR /app

# Copy root pom and both module poms to satisfy reactor
COPY pom.xml .
COPY imagey-web/pom.xml imagey-web/
COPY imagey-server/pom.xml imagey-server/

# Download frontend dependencies to cache them
RUN mvn dependency:go-offline -pl imagey-web -am

# Copy frontend source code and build it
COPY imagey-web/ imagey-web/
RUN mvn clean install -pl imagey-web -am -DskipTests


# Stage 2: Build Backend
FROM maven:3.9-eclipse-temurin-17 AS backend-builder
WORKDIR /app

# Copy root pom and both module poms
COPY pom.xml .
COPY imagey-web/pom.xml imagey-web/
COPY imagey-server/pom.xml imagey-server/

# Copy the built frontend jar from Stage 1 into the local maven repo of this stage
COPY --from=frontend-builder /root/.m2/repository/cloud/imagey/imagey-web/ /root/.m2/repository/cloud/imagey/imagey-web/

# Download backend dependencies to cache them
RUN mvn dependency:go-offline -pl imagey-server -am

# Copy backend source code and build the meecrowave bundle
COPY imagey-server/ imagey-server/
RUN cd imagey-server && mvn clean package meecrowave:bundle -am -DskipTests

# Stage 3: Unpack and Run
FROM eclipse-temurin:17-jre
WORKDIR /app

# Install unzip to extract the bundle
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

# Copy the zip from Stage 2
COPY --from=backend-builder /app/imagey-server/target/imagey-server-meecrowave-distribution.zip .

# Unzip and cleanup
RUN unzip imagey-server-meecrowave-distribution.zip && \
    rm imagey-server-meecrowave-distribution.zip && \
    chmod +x imagey-server-distribution/bin/meecrowave.sh

# Expose Meecrowave default port
EXPOSE 8080

# Run the bundle
CMD ["./imagey-server-distribution/bin/meecrowave.sh", "run"]
