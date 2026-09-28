"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "engine_tables",
        {
          id: {
            type: Sequelize.STRING,
            allowNull: false,
            primaryKey: true,
          },
          teamId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "teams" },
            onDelete: "CASCADE",
          },
          baseId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "",
          },
          version: {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex("engine_tables", ["baseId"], {
        name: "engine_tables_base_id",
        transaction,
      });
      await queryInterface.addIndex("engine_tables", ["teamId"], {
        name: "engine_tables_team_id",
        transaction,
      });

      const tableId = {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: "engine_tables" },
        onDelete: "CASCADE",
      };

      await queryInterface.createTable(
        "engine_fields",
        {
          id: {
            type: Sequelize.STRING,
            allowNull: false,
            primaryKey: true,
          },
          tableId,
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "",
          },
          type: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          options: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          lookupOptions: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          isPrimary: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          isComputed: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          isLookup: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          cellValueType: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "string",
          },
          isMultipleCellValue: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          order: {
            type: Sequelize.DOUBLE,
            allowNull: false,
            defaultValue: 0,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex("engine_fields", ["tableId"], {
        name: "engine_fields_table_id",
        transaction,
      });

      await queryInterface.createTable(
        "engine_views",
        {
          id: {
            type: Sequelize.STRING,
            allowNull: false,
            primaryKey: true,
          },
          tableId,
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: "",
          },
          type: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          order: {
            type: Sequelize.DOUBLE,
            allowNull: false,
            defaultValue: 0,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          filter: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          sort: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          group: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          columnMeta: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          options: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          isLocked: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
          updatedAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex("engine_views", ["tableId"], {
        name: "engine_views_table_id",
        transaction,
      });

      await queryInterface.createTable(
        "engine_records",
        {
          id: {
            type: Sequelize.STRING,
            allowNull: false,
            primaryKey: true,
          },
          tableId,
          cells: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          autoNumber: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          orders: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          createdTime: { type: Sequelize.DATE, allowNull: false },
          lastModifiedTime: { type: Sequelize.DATE, allowNull: false },
          createdById: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          lastModifiedById: {
            type: Sequelize.STRING,
            allowNull: true,
          },
        },
        { transaction }
      );
      await queryInterface.addIndex(
        "engine_records",
        ["tableId", "autoNumber"],
        {
          unique: true,
          name: "engine_records_table_id_auto_number",
          transaction,
        }
      );

      await queryInterface.createTable(
        "engine_record_history",
        {
          id: {
            type: Sequelize.STRING,
            allowNull: false,
            primaryKey: true,
          },
          tableId,
          recordId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          fieldId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          before: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          after: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          actorId: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          createdAt: { type: Sequelize.DATE, allowNull: false },
        },
        { transaction }
      );
      await queryInterface.addIndex(
        "engine_record_history",
        ["recordId", "createdAt"],
        {
          name: "engine_record_history_record_id_created_at",
          transaction,
        }
      );
      await queryInterface.addIndex("engine_record_history", ["tableId"], {
        name: "engine_record_history_table_id",
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable("engine_record_history", { transaction });
      await queryInterface.dropTable("engine_records", { transaction });
      await queryInterface.dropTable("engine_views", { transaction });
      await queryInterface.dropTable("engine_fields", { transaction });
      await queryInterface.dropTable("engine_tables", { transaction });
    });
  },
};
