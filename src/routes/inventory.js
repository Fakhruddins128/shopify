const express = require("express");
const { authJwt } = require("../middleware/auth");
const { getPool, sql } = require("../db/mssql");

const router = express.Router();

const normalizeItemCode = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const baseItemCode = trimmed ? trimmed.split("-")[0] : "";

  return {
    fullItemCode: trimmed,
    baseItemCode
  };
};

const validateBody = (body) => {
  const errors = {};
  const { fullItemCode, baseItemCode } = normalizeItemCode(body && body.itemCode);
  const branchCode =
    body && typeof body.branchCode === "string" ? body.branchCode.trim() : "";

  if (!fullItemCode) errors.itemCode = "itemCode is required";
  if (!branchCode) errors.branchCode = "branchCode is required";

  return { itemCode: fullItemCode, baseItemCode, branchCode, errors };
};

router.post("/item-stock", authJwt(), async (req, res, next) => {
  try {
    const { itemCode, baseItemCode, branchCode, errors } = validateBody(req.body);
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation error.",
        errors
      });
    }

    const pool = await getPool();

    const storeResult = await pool
      .request()
      .input("BranchCode", sql.VarChar(20), branchCode)
      .query(
        `
        SELECT TOP 1
          S.ID AS StoreId
        FROM Store S
        WHERE S.StoreCode = @BranchCode
          AND S.Active = 1
        `
      );

    const storeRow = storeResult.recordset && storeResult.recordset[0];
    if (!storeRow || storeRow.StoreId == null) {
      return res.status(404).json({ success: false, message: "Branch not found." });
    }

    const storeId = storeRow.StoreId;

    const stockResult = await pool
      .request()
      .input("ItemCode", sql.VarChar(50), itemCode)
      .input("BaseItemCode", sql.VarChar(20), baseItemCode)
      .input("StoreId", sql.Int, storeId)
      .query(
        `
        SELECT
          Category,
          OldCode,
          ItemCode,
          ProductName,
          Material,
          Color,
          Finish,
          SUM(Stock) AS Stock
        FROM (
          SELECT
            C2.Description AS Category,
            VD.OldCode,
            (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code) AS ItemCode,
            IM.ProductName,
            M.ProductName AS Material,
            C.Color,
            F.Finish,
            SUM(VD.T_Stock) AS Stock
          FROM ItemMaster IM
          INNER JOIN Category3 C3 ON IM.FKSubGroupID = C3.ID
          INNER JOIN Category2 C2 ON C3.FK_Category2ID = C2.ID
          INNER JOIN FinishProductVariantDetail VD ON VD.FK_ItemMasterID = IM.ID
          INNER JOIN FP_MaterialMaster M ON VD.FKMaterialID = M.ID
          INNER JOIN FP_ColorMaster C ON VD.FKColourID = C.ID
          INNER JOIN Finish F ON VD.FKFinishID = F.ID
          GROUP BY
            C2.Description,
            VD.OldCode,
            (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code),
            IM.ProductName,
            M.ProductName,
            C.Color,
            F.Finish

          UNION ALL

          SELECT
            C2.Description AS Category,
            VD.OldCode,
            (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code) AS ItemCode,
            IM.ProductName,
            M.ProductName AS Material,
            C.Color,
            F.Finish,
            SUM(SD.Stock) AS Stock
          FROM ItemMaster IM
          INNER JOIN Category3 C3 ON IM.FKSubGroupID = C3.ID
          INNER JOIN Category2 C2 ON C3.FK_Category2ID = C2.ID
          INNER JOIN FinishProductVariantDetail VD ON VD.FK_ItemMasterID = IM.ID
          INNER JOIN FP_MaterialMaster M ON VD.FKMaterialID = M.ID
          INNER JOIN FP_ColorMaster C ON VD.FKColourID = C.ID
          INNER JOIN Finish F ON VD.FKFinishID = F.ID
          INNER JOIN StoreDetail SD ON SD.FK_Variant = VD.ID
          INNER JOIN Store S ON SD.FK_Store = S.ID
                        AND S.Active = 1
                        AND S.ID = @StoreId
          GROUP BY
            C2.Description,
            VD.OldCode,
            (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code),
            IM.ProductName,
            M.ProductName,
            C.Color,
            F.Finish
        ) AS Combined
        WHERE (ItemCode = @ItemCode OR LEFT(ItemCode, 6) = @BaseItemCode)
          AND Stock > 0
        GROUP BY
          Category,
          OldCode,
          ItemCode,
          ProductName,
          Material,
          Color,
          Finish
        ORDER BY
          ItemCode
        `
      );

    return res.status(200).json({
      success: true,
      message: "Stock fetched successfully.",
      data: stockResult.recordset || []
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
