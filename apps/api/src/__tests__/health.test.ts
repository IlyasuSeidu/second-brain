import request from "supertest";

import { createApp } from "../app";
import { checkDatabaseConnection } from "../services/prisma";

jest.mock("../services/prisma", () => ({
  checkDatabaseConnection: jest.fn(),
}));

describe("GET /health", () => {
  const mockedCheckDatabaseConnection = checkDatabaseConnection as jest.MockedFunction<
    typeof checkDatabaseConnection
  >;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns service health payload", async () => {
    mockedCheckDatabaseConnection.mockResolvedValue(true);

    const app = createApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("api");
    expect(response.body.database).toBe("up");
    expect(typeof response.body.timestamp).toBe("string");
  });

  it("returns 503 when database is unavailable", async () => {
    mockedCheckDatabaseConnection.mockResolvedValue(false);

    const app = createApp();

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("error");
    expect(response.body.service).toBe("api");
    expect(response.body.database).toBe("down");
    expect(typeof response.body.timestamp).toBe("string");
  });
});
