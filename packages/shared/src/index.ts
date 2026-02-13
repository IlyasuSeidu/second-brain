export type HealthResponse = {
  status: "ok" | "error";
  service: "api";
  database: "up" | "down";
  timestamp: string;
};
