import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";
import { and, eq } from "drizzle-orm";
import {
  workflowTemplates,
  workflowSteps,
  workflowStepTransitions,
  workflowInstances,
  workflowStepAssignments,
  workflowActions,
} from "@/server/db/schema";
import { z } from "zod";

// Create the tRPC router
export const workflowsRouter = createTRPCRouter({
  createWorkflowTemplate: publicProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        steps: z.array(
          z.object({
            name: z.string(),
            stepOrder: z.number(),
            roleId: z.number(),
            isMandatory: z.boolean(),
            canModify: z.boolean(),
            rejectionStepId: z.number().optional(),
          }),
        ),
        transitions: z.array(
          z.object({
            fromStepId: z.number(),
            toStepId: z.number(),
            conditionType: z.string().optional(),
            conditionValue: z.record(z.any()).optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      return await db.transaction(async (tx) => {
        const [template] = await tx
          .insert(workflowTemplates)
          .values({
            name: input.name,
            description: input.description,
            isActive: true,
          })
          .returning();

        if (!template) {
          throw new Error("Workflow template not created");
        }

        const steps = await Promise.all(
          input.steps.map(async (step) => {
            const [newStep] = await tx
              .insert(workflowSteps)
              .values({ ...step, workflowTemplateId: template.id })
              .returning();
            return newStep;
          }),
        );

        if (steps.length > 0) {
          await tx.insert(workflowStepTransitions).values(
            input.transitions.map((transition) => ({
              ...transition,
              createdAt: new Date(),
            })),
          );
        }

        return template;
      });
    }),

  startWorkflow: publicProcedure
    .input(
      z.object({
        templateId: z.number(),
        entityType: z.string(),
        entityId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      return await db.transaction(async (tx) => {
        const template = await db.query.workflowTemplates.findFirst({
          where: eq(workflowTemplates.id, input.templateId),
          with: {
            steps: {
              where: eq(workflowSteps.stepOrder, 1),
              limit: 1,
            },
          },
        });

        if (!template || template.steps.length === 0) {
          throw new Error("Workflow template not found or has no steps");
        }

        const firstStep = template.steps[0];

        if (!firstStep) {
          throw new Error("Workflow template has no first step");
        }

        const eligibleAssignment = await db.query.userRoles.findFirst({
          where: eq(workflowSteps.roleId, firstStep.roleId),
          with: { user: true },
        });

        if (!eligibleAssignment?.user) {
          throw new Error("No eligible users found for first step");
        }

        const [instance] = await tx
          .insert(workflowInstances)
          .values({
            workflowTemplateId: template.id,
            currentStepId: firstStep.id,
            currentAssigneeId: eligibleAssignment.user.id,
            entityType: input.entityType,
            entityId: input.entityId,
            status: "ACTIVE",
          })
          .returning();

        if (!instance) {
          throw new Error("instance not found");
        }

        await tx.insert(workflowStepAssignments).values({
          workflowInstanceId: instance.id,
          stepId: firstStep.id,
          assigneeId: eligibleAssignment.user.id,
          status: "PENDING",
        });

        return instance;
      });
    }),

  takeAction: publicProcedure
    .input(
      z.object({
        instanceId: z.number(),
        userId: z.string(),
        actionType: z.enum(["APPROVE", "REJECT", "MODIFY"]),
        comments: z.string().optional(),
        dataModifications: z.record(z.any()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await db.transaction(async (tx) => {
        const instance = await tx.query.workflowInstances.findFirst({
          where: eq(workflowInstances.id, input.instanceId),
          with: {
            currentStep: { with: { fromTransitions: true } },
          },
        });

        if (!instance) {
          throw new Error("Workflow instance not found");
        }

        if (instance.currentAssigneeId !== input.userId) {
          throw new Error("Not authorized to take action on this step");
        }

        const [action] = await tx
          .insert(workflowActions)
          .values({
            workflowInstanceId: instance.id,
            stepId: instance.currentStepId,
            userId: input.userId,
            actionType: input.actionType,
            comments: input.comments,
            dataModifications: input.dataModifications,
          })
          .returning();

        if (
          input.actionType === "REJECT" &&
          instance.currentStep?.rejectionStepId
        ) {
          return await handleRejection(
            instance,
            instance.currentStep.rejectionStepId,
          );
        } else if (input.actionType === "APPROVE") {
          return await handleApproval(
            instance,
            instance.currentStep?.fromTransitions || [],
          );
        }

        return instance;
      });
    }),

  getAssignedWorkflows: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        status: z.enum(["ACTIVE", "COMPLETED", "REJECTED"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      return await db.query.workflowInstances.findMany({
        where: and(
          eq(workflowInstances.currentAssigneeId, input.userId),
          input.status ? eq(workflowInstances.status, input.status) : undefined,
        ),
        with: {
          template: true,
          currentStep: true,
          currentAssignee: true,
        },
        orderBy: (workflowInstances) => [workflowInstances.createdAt],
      });
    }),
});
