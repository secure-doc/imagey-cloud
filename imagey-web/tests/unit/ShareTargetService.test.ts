/* eslint-disable @typescript-eslint/no-explicit-any */
import { shareTargetService } from "../../src/activity/ShareTargetService";

describe("ShareTargetService", () => {
  let mockRequest: any;
  let mockStore: any;
  let mockTransaction: any;
  let mockDb: any;
  let originalIndexedDB: any;

  beforeEach(() => {
    mockStore = {
      getAll: vi.fn(),
      clear: vi.fn(),
      add: vi.fn(),
    };

    mockTransaction = {
      objectStore: vi.fn().mockReturnValue(mockStore),
    };

    mockDb = {
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(false),
      },
      createObjectStore: vi.fn(),
      transaction: vi.fn().mockReturnValue(mockTransaction),
    };

    mockRequest = {};

    const mockIndexedDB = {
      open: vi.fn().mockReturnValue(mockRequest),
    };

    originalIndexedDB = global.indexedDB;
    global.indexedDB = mockIndexedDB as any;
  });

  afterEach(() => {
    global.indexedDB = originalIndexedDB;
  });

  it("should create object store on upgrade needed", async () => {
    const promise = shareTargetService.getSharedFiles();

    // Simulate upgrade needed
    mockRequest.onupgradeneeded({ target: { result: mockDb } });

    // Complete the open
    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    // Complete the getAll
    mockStore.getAll.mock.results[0].value.result = [];
    mockStore.getAll.mock.results[0].value.onsuccess();

    await promise;

    expect(mockDb.createObjectStore).toHaveBeenCalledWith("sharedFiles", {
      autoIncrement: true,
    });
  });

  it("should not create object store if it already exists", async () => {
    mockDb.objectStoreNames.contains.mockReturnValue(true);

    const promise = shareTargetService.getSharedFiles();

    // Simulate upgrade needed
    mockRequest.onupgradeneeded({ target: { result: mockDb } });

    // Complete the open
    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    // Complete the getAll
    mockStore.getAll.mock.results[0].value.result = [];
    mockStore.getAll.mock.results[0].value.onsuccess();

    await promise;

    expect(mockDb.createObjectStore).not.toHaveBeenCalled();
  });

  it("should return an empty array when no files are shared", async () => {
    const promise = shareTargetService.getSharedFiles();

    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    const getRequest = { result: [], onsuccess: vi.fn() };
    mockStore.getAll.mockReturnValue(getRequest);

    getRequest.onsuccess();

    const files = await promise;
    expect(files).toEqual([]);
  });

  it("should handle error opening database", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const promise = shareTargetService.getSharedFiles();

    mockRequest.error = new Error("DB Error");
    mockRequest.onerror();

    const files = await promise;
    expect(files).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should handle error reading store", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const promise = shareTargetService.getSharedFiles();

    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    const getRequest: any = { error: new Error("Store Error") };
    mockStore.getAll.mockReturnValue(getRequest);

    getRequest.onerror();

    const files = await promise;
    expect(files).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should clear shared files successfully", async () => {
    const promise = shareTargetService.clearSharedFiles();

    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    const clearRequest = { onsuccess: vi.fn() };
    mockStore.clear.mockReturnValue(clearRequest);

    clearRequest.onsuccess();

    await promise;
    expect(mockStore.clear).toHaveBeenCalled();
  });

  it("should handle clear files error gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const promise = shareTargetService.clearSharedFiles();

    mockRequest.result = mockDb;
    mockRequest.onsuccess();

    const clearRequest: any = { error: new Error("Clear Error") };
    mockStore.clear.mockReturnValue(clearRequest);

    clearRequest.onerror();

    await promise;
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
