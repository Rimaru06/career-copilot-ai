import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createResume, setPrimaryResume } from "./resume.service";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    resume: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("createResume", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("marks the resume as primary when the user has no existing resumes", async () => {
        const input = {
            userId: "user-id",
            title: "My Resume",
            storageKey: "storage-key",
            fileType: "pdf",
        };

        const fakeResume = {
            id: "resume-id",
            userId: input.userId,
            title: input.title,
            storageKey: input.storageKey,
            fileType: input.fileType,
            isPrimary: true,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.resume.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.resume.create).mockResolvedValue(fakeResume);

        const result = await createResume(input);

        expect(prisma.resume.create).toHaveBeenCalledWith({
            data: {
                userId: input.userId,
                title: input.title,
                storageKey: input.storageKey,
                fileType: input.fileType,
                isPrimary: true,
            },
        });
        expect(result).toBe(fakeResume);
    });

    it("does not mark the resume as primary when the user already has a resume", async () => {
        const input = {
            userId: "user-id",
            title: "My Second Resume",
            storageKey: "storage-key-2",
            fileType: "pdf",
        };

        const fakeResume = {
            id: "resume-id-2",
            userId: input.userId,
            title: input.title,
            storageKey: input.storageKey,
            fileType: input.fileType,
            isPrimary: false,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.resume.findFirst).mockResolvedValue({
            id: "existing-resume-id",
        } as Awaited<ReturnType<typeof prisma.resume.findFirst>>);
        vi.mocked(prisma.resume.create).mockResolvedValue(fakeResume);

        const result = await createResume(input);

        expect(prisma.resume.create).toHaveBeenCalledWith({
            data: {
                userId: input.userId,
                title: input.title,
                storageKey: input.storageKey,
                fileType: input.fileType,
                isPrimary: false,
            },
        });
        expect(result).toBe(fakeResume);
    });
});

describe("setPrimaryResume", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("throws when the resume does not exist and never starts a transaction", async () => {
        vi.mocked(prisma.resume.findUnique).mockResolvedValue(null);

        await expect(
            setPrimaryResume("user-id", "missing-resume-id")
        ).rejects.toThrow("Resume not found");

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("throws when the resume belongs to a different user and never starts a transaction", async () => {
        vi.mocked(prisma.resume.findUnique).mockResolvedValue({
            id: "resume-id",
            userId: "user-A",
            title: "Someone else's resume",
            storageKey: "storage-key",
            fileType: "pdf",
            isPrimary: false,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(
            setPrimaryResume("user-B", "resume-id")
        ).rejects.toThrow("Unauthorized");

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns the resume when it is already primary and never starts a transaction", async () => {
        const existingResume = {
            id: "resume-id",
            userId: "user-A",
            title: "Primary Resume",
            storageKey: "storage-key",
            fileType: "pdf",
            isPrimary: true,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(prisma.resume.findUnique).mockResolvedValue(existingResume);

        const result = await setPrimaryResume("user-A", "resume-id");

        expect(result).toBe(existingResume);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("demotes the current primary and promotes the requested resume", async () => {
        const requestedResume = {
            id: "resume-B",
            userId: "user-A",
            title: "Resume B",
            storageKey: "storage-key-b",
            fileType: "pdf",
            isPrimary: false,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const currentPrimary = {
            id: "resume-A",
            userId: "user-A",
            title: "Resume A",
            storageKey: "storage-key-a",
            fileType: "pdf",
            isPrimary: true,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const updatedRequestedResume = {
            ...requestedResume,
            isPrimary: true,
        };

        vi.mocked(prisma.resume.findUnique).mockResolvedValue(requestedResume);

        const tx = {
            resume: {
                findFirst: vi.fn().mockResolvedValue(currentPrimary),
                update: vi
                    .fn()
                    .mockResolvedValueOnce({ ...currentPrimary, isPrimary: false })
                    .mockResolvedValueOnce(updatedRequestedResume),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (callback: any) => callback(tx)
        );

        const result = await setPrimaryResume("user-A", "resume-B");

        expect(tx.resume.findFirst).toHaveBeenCalledWith({
            where: {
                userId: "user-A",
                isPrimary: true,
            },
        });

        expect(tx.resume.update).toHaveBeenNthCalledWith(1, {
            where: { id: "resume-A" },
            data: { isPrimary: false },
        });

        expect(tx.resume.update).toHaveBeenNthCalledWith(2, {
            where: { id: "resume-B" },
            data: { isPrimary: true },
        });

        expect(result).toBe(updatedRequestedResume);
    });

    it("promotes the requested resume without demoting anyone when no primary exists", async () => {
        const requestedResume = {
            id: "resume-B",
            userId: "user-A",
            title: "Resume B",
            storageKey: "storage-key-b",
            fileType: "pdf",
            isPrimary: false,
            parserVersion: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const updatedRequestedResume = {
            ...requestedResume,
            isPrimary: true,
        };

        vi.mocked(prisma.resume.findUnique).mockResolvedValue(requestedResume);

        const tx = {
            resume: {
                findFirst: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockResolvedValue(updatedRequestedResume),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (callback: any) => callback(tx)
        );

        const result = await setPrimaryResume("user-A", "resume-B");

        expect(tx.resume.findFirst).toHaveBeenCalledWith({
            where: {
                userId: "user-A",
                isPrimary: true,
            },
        });

        expect(tx.resume.update).toHaveBeenCalledTimes(1);
        expect(tx.resume.update).toHaveBeenCalledWith({
            where: { id: "resume-B" },
            data: { isPrimary: true },
        });

        expect(result).toBe(updatedRequestedResume);
    });
});