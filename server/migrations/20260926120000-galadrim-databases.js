"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "databases",
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
          collectionId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "collections" },
            onDelete: "CASCADE",
          },
          documentId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "documents" },
            onDelete: "SET NULL",
          },
          title: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "",
          },
          icon: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          engine: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "teable",
          },
          externalBaseId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          externalTableId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          settings: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          createdById: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "users" },
            onDelete: "SET NULL",
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
          deletedAt: { type: Sequelize.DATE, allowNull: true },
        },
        { transaction }
      );
      await queryInterface.addIndex(
        "databases",
        ["teamId", "externalTableId"],
        {
          unique: true,
          where: { deletedAt: null },
          name: "databases_team_id_external_table_id",
          transaction,
        }
      );
      await queryInterface.addIndex("databases", ["documentId"], {
        transaction,
      });
      await queryInterface.addIndex("databases", ["collectionId"], {
        transaction,
      });

      await queryInterface.addColumn(
        "documents",
        "databaseId",
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: "databases" },
          onDelete: "SET NULL",
        },
        { transaction }
      );
      await queryInterface.addColumn(
        "documents",
        "databaseRecordId",
        { type: Sequelize.STRING, allowNull: true },
        { transaction }
      );
      await queryInterface.addIndex(
        "documents",
        ["databaseId", "databaseRecordId"],
        {
          unique: true,
          where: { deletedAt: null },
          name: "documents_database_id_database_record_id",
          transaction,
        }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex(
        "documents",
        "documents_database_id_database_record_id",
        { transaction }
      );
      await queryInterface.removeColumn("documents", "databaseRecordId", {
        transaction,
      });
      await queryInterface.removeColumn("documents", "databaseId", {
        transaction,
      });
      await queryInterface.dropTable("databases", { transaction });
    });
  },
};
