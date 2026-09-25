"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "database_automations",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "teams" },
            onDelete: "CASCADE",
          },
          databaseId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "databases" },
            onDelete: "CASCADE",
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "",
          },
          enabled: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          trigger: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          conditions: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          actions: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          createdById: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users" },
            onDelete: "SET NULL",
          },
          lastRunAt: { type: Sequelize.DATE, allowNull: true },
          lastError: { type: Sequelize.TEXT, allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
          deletedAt: { type: Sequelize.DATE, allowNull: true },
        },
        { transaction }
      );
      await queryInterface.addIndex("database_automations", ["databaseId"], {
        where: { deletedAt: null },
        name: "database_automations_database_id",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("database_automations");
  },
};
