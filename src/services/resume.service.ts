import { prisma } from "@/lib/prisma";

type CreateResumeInput = {
    userId: string;
    title: string;
    storageKey: string;
    fileType: string;
};

export async function createResume(input: CreateResumeInput) {
    const existingResume = await prisma.resume.findFirst({
        where: {
            userId: input.userId,
        },
        select: {
            id: true,
        },
    });

    const isPrimary = existingResume === null;

    const newResume = await prisma.resume.create({
        data: {
            userId: input.userId,
            title: input.title,
            storageKey: input.storageKey,
            fileType: input.fileType,
            isPrimary,
        },
    });

    return newResume;
}

export async function setPrimaryResume(userId: string, resumeId: string) {
    const existingResume = await prisma.resume.findUnique({
        where: {
            id: resumeId
        }
    });

    if (!existingResume) {
        throw new Error("Resume not found");
    }

    if (existingResume.userId !== userId) {
        throw new Error("Unauthorized");
    }

    if (existingResume.isPrimary) {
        return existingResume;
    }

    const currentPrimary = await prisma.resume.findFirst({
        where: {
            userId: userId,
            isPrimary: true
        }
    });

   const updatedResume = await prisma.$transaction(async (tx) => {
    if (currentPrimary) {
        await tx.resume.update({
            where: {
                id: currentPrimary.id,
            },
            data: {
                isPrimary: false,
            },
        });
    }

    const updatedNewPrimary = await tx.resume.update({
        where: {
            id: resumeId,
        },
        data: {
            isPrimary: true,
        },
    });

    return updatedNewPrimary;
});

return updatedResume;
}