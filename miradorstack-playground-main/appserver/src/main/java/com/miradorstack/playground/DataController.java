package com.miradorstack.playground;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.cassandra.core.CassandraOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api")
@Tag(name = "Data Operations", description = "CRUD operations for key-value data with dual storage (Valkey + Cassandra)")
public class DataController {

    private static final Logger logger = LoggerFactory.getLogger(DataController.class);

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired(required = false)
    private CassandraOperations cassandraOperations;

    @GetMapping("/read/{key}")
    @Operation(summary = "Read data from both storage systems",
               description = "Retrieves the value for a given key from both Valkey (cache) and Cassandra (persistent storage)")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Data retrieved successfully"),
        @ApiResponse(responseCode = "404", description = "Key not found")
    })
    public ResponseEntity<Map<String, String>> read(
            @Parameter(description = "The key to retrieve", required = true, example = "mykey")
            @PathVariable String key) {
        Map<String, String> result = new HashMap<>();

        // Read from Valkey
        try {
            String valkeyValue = redisTemplate.opsForValue().get(key);
            result.put("valkey", valkeyValue != null ? valkeyValue : "Not found");
        } catch (Exception e) {
            logger.warn("Valkey service unavailable", e);
            result.put("valkey", "Service unavailable");
        }

        // Read from Cassandra
        if (cassandraOperations != null) {
            try {
                KeyValue kv = cassandraOperations.selectOneById(key, KeyValue.class);
                String cassandraValue = kv != null ? kv.getValue() : "Not found";
                result.put("cassandra", cassandraValue);
            } catch (Exception e) {
                logger.warn("Cassandra service unavailable", e);
                result.put("cassandra", "Service unavailable");
            }
        } else {
            result.put("cassandra", "Service unavailable");
        }

        return ResponseEntity.ok(result);
    }

    @GetMapping("/list")
    @Operation(summary = "List all keys",
               description = "Retrieves all keys from Valkey storage system")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Keys retrieved successfully")
    })
    public ResponseEntity<List<String>> list() {
        try {
            Set<String> keysSet = redisTemplate.keys("*");
            return ResponseEntity.ok(new ArrayList<>(keysSet));
        } catch (Exception e) {
            logger.warn("Valkey service unavailable", e);
            return ResponseEntity.ok(Collections.emptyList());
        }
    }

    @PostMapping("/create")
    @Operation(summary = "Create a new key-value pair",
               description = "Creates a new key-value pair in both Valkey and Cassandra storage systems")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Data created successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid input parameters")
    })
    public ResponseEntity<String> create(
            @Parameter(description = "The key for the new data", required = true, example = "mykey")
            @RequestParam String key,
            @Parameter(description = "The value to store", required = true, example = "myvalue")
            @RequestParam String value) {
        // Create in Valkey
        try {
            redisTemplate.opsForValue().set(key, value);
        } catch (Exception e) {
            logger.warn("Valkey service unavailable", e);
        }

        // Create in Cassandra
        if (cassandraOperations != null) {
            try {
                cassandraOperations.insert(new KeyValue(key, value));
            } catch (Exception e) {
                logger.warn("Cassandra service unavailable", e);
            }
        }

        return ResponseEntity.ok("Created");
    }

    @PutMapping("/modify/{key}")
    @Operation(summary = "Modify an existing key-value pair",
               description = "Updates the value for an existing key in both Valkey and Cassandra storage systems")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Data modified successfully"),
        @ApiResponse(responseCode = "404", description = "Key not found")
    })
    public ResponseEntity<String> modify(
            @Parameter(description = "The key to modify", required = true, example = "mykey")
            @PathVariable String key,
            @Parameter(description = "The new value", required = true, example = "newvalue")
            @RequestParam String value) {
        // Check if exists in Valkey
        try {
            if (redisTemplate.hasKey(key)) {
                redisTemplate.opsForValue().set(key, value);
                if (cassandraOperations != null) {
                    try {
                        cassandraOperations.update(new KeyValue(key, value));
                    } catch (Exception e) {
                        logger.warn("Cassandra service unavailable", e);
                    }
                }
                return ResponseEntity.ok("Modified");
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (Exception e) {
            logger.warn("Valkey service unavailable", e);
            return ResponseEntity.ok("Modified (Valkey unavailable)");
        }
    }

    @DeleteMapping("/delete/{key}")
    @Operation(summary = "Delete a key-value pair",
               description = "Deletes the key-value pair from both Valkey and Cassandra storage systems")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Data deleted successfully"),
        @ApiResponse(responseCode = "404", description = "Key not found")
    })
    public ResponseEntity<String> delete(
            @Parameter(description = "The key to delete", required = true, example = "mykey")
            @PathVariable String key) {
        // Delete from Valkey
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            logger.warn("Valkey service unavailable", e);
        }

        // Delete from Cassandra
        if (cassandraOperations != null) {
            try {
                cassandraOperations.deleteById(key, KeyValue.class);
            } catch (Exception e) {
                logger.warn("Cassandra service unavailable", e);
            }
        }

        return ResponseEntity.ok("Deleted");
    }
}