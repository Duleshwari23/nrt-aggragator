FROM openjdk:21-jdk-slim

WORKDIR /app

# Copy pom.xml and download dependencies
COPY pom.xml .
RUN apt-get update && apt-get install -y maven && mvn dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN mvn clean package -DskipTests -B

# Expose port
EXPOSE 8080

# Run the application
CMD ["java", "-jar", "target/playground-0.0.1-SNAPSHOT.jar"]
