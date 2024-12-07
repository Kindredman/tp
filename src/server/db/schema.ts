// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTableCreator,
  timestamp,
  varchar,
  text,
  boolean,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `tp_${name}`);

export const posts = createTable(
  "post",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("name", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (example) => ({
    nameIndex: index("name_idx").on(example.name),
  }),
);

export const users = createTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
});

export const roles = createTable("roles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userRoles = createTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey(table.userId, table.roleId),
  }),
);

export const workflowTemplates = createTable("workflow_templates", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowSteps = createTable("workflow_steps", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  workflowTemplateId: integer("workflow_template_id")
    .notNull()
    .references(() => workflowTemplates.id),
  name: varchar("name", { length: 255 }).notNull(),
  stepOrder: integer("step_order").notNull(),
  roleId: integer("role_id")
    .notNull()
    .references(() => roles.id),
  isMandatory: boolean("is_mandatory").default(true).notNull(),
  canModify: boolean("can_modify").default(false).notNull(),
  rejectionStepId: integer("rejection_step_id"),
  // .references(
  //   () => workflowSteps.id,
  // ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workflowStepTransitions = createTable(
  "workflow_step_transitions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    fromStepId: integer("from_step_id")
      .notNull()
      .references(() => workflowSteps.id),
    toStepId: integer("to_step_id")
      .notNull()
      .references(() => workflowSteps.id),
    conditionType: varchar("condition_type", { length: 50 }),
    conditionValue: jsonb("condition_value"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);

export const workflowInstances = createTable("workflow_instances", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  workflowTemplateId: integer("workflow_template_id")
    .notNull()
    .references(() => workflowTemplates.id),
  currentStepId: integer("current_step_id")
    .notNull()
    .references(() => workflowSteps.id),
  currentAssigneeId: text("current_assignee_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const workflowStepAssignments = createTable(
  "workflow_step_assignments",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    workflowInstanceId: integer("workflow_instance_id")
      .notNull()
      .references(() => workflowInstances.id),
    stepId: integer("step_id")
      .notNull()
      .references(() => workflowSteps.id),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
);

export const workflowActions = createTable("workflow_actions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  workflowInstanceId: integer("workflow_instance_id")
    .notNull()
    .references(() => workflowInstances.id),
  stepId: integer("step_id")
    .notNull()
    .references(() => workflowSteps.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  actionType: varchar("action_type", { length: 20 }).notNull(),
  comments: text("comments"),
  dataModifications: jsonb("data_modifications"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  assignedWorkflows: many(workflowInstances, {
    relationName: "assignedWorkflows",
  }),
  workflowActions: many(workflowActions),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  workflowSteps: many(workflowSteps),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const workflowTemplatesRelations = relations(
  workflowTemplates,
  ({ many }) => ({
    steps: many(workflowSteps),
    instances: many(workflowInstances),
  }),
);

export const workflowStepsRelations = relations(
  workflowSteps,
  ({ one, many }) => ({
    template: one(workflowTemplates, {
      fields: [workflowSteps.workflowTemplateId],
      references: [workflowTemplates.id],
    }),
    role: one(roles, {
      fields: [workflowSteps.roleId],
      references: [roles.id],
    }),
    rejectionStep: one(workflowSteps, {
      fields: [workflowSteps.rejectionStepId],
      references: [workflowSteps.id],
    }),
    fromTransitions: many(workflowStepTransitions, {
      relationName: "fromTransitions",
    }),
    toTransitions: many(workflowStepTransitions, {
      relationName: "toTransitions",
    }),
    assignments: many(workflowStepAssignments),
    actions: many(workflowActions),
  }),
);

export const workflowInstancesRelations = relations(
  workflowInstances,
  ({ one, many }) => ({
    template: one(workflowTemplates, {
      fields: [workflowInstances.workflowTemplateId],
      references: [workflowTemplates.id],
    }),
    currentStep: one(workflowSteps, {
      fields: [workflowInstances.currentStepId],
      references: [workflowSteps.id],
    }),
    currentAssignee: one(users, {
      fields: [workflowInstances.currentAssigneeId],
      references: [users.id],
    }),
    assignments: many(workflowStepAssignments),
    actions: many(workflowActions),
  }),
);
