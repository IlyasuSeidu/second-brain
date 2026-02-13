import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import type { HealthResponse } from "@second-brain/shared";

const healthSnapshot: HealthResponse = {
  status: "ok",
  service: "api",
  database: "up",
  timestamp: new Date().toISOString(),
};

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.title}>BrainDumb</Text>
        <Text style={styles.subtitle}>AI-powered second brain for mobile.</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shared Type Check</Text>
          <Text style={styles.cardBody}>{JSON.stringify(healthSnapshot, null, 2)}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f3f4f6",
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    color: "#111827",
    fontSize: 34,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#374151",
    fontSize: 16,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardBody: {
    color: "#4b5563",
    fontFamily: "Courier",
    fontSize: 12,
  },
});
