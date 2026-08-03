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

const validateSalesUpdateBody = (body) => {
  const errors = {};
  const branchCode =
    body && typeof body.branchCode === "string" ? body.branchCode.trim() : "";
  const startDateTimeRaw =
    body && typeof body.startDateTime === "string" ? body.startDateTime.trim() : "";
  const endDateTimeRaw =
    body && typeof body.endDateTime === "string" ? body.endDateTime.trim() : "";

  if (!branchCode) errors.branchCode = "branchCode is required";
  if (!startDateTimeRaw) errors.startDateTime = "startDateTime is required";
  if (!endDateTimeRaw) errors.endDateTime = "endDateTime is required";

  const startDateTime = startDateTimeRaw ? new Date(startDateTimeRaw) : null;
  const endDateTime = endDateTimeRaw ? new Date(endDateTimeRaw) : null;

  if (startDateTimeRaw && (!startDateTime || Number.isNaN(startDateTime.getTime()))) {
    errors.startDateTime = "startDateTime is invalid";
  }

  if (endDateTimeRaw && (!endDateTime || Number.isNaN(endDateTime.getTime()))) {
    errors.endDateTime = "endDateTime is invalid";
  }

  if (
    startDateTime &&
    endDateTime &&
    !Number.isNaN(startDateTime.getTime()) &&
    !Number.isNaN(endDateTime.getTime()) &&
    startDateTime > endDateTime
  ) {
    errors.endDateTime = "endDateTime must be greater than or equal to startDateTime";
  }

  return { branchCode, startDateTime, endDateTime, errors };
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

const zeroStockHandler = async (req, res, next) => {
  try {
    const pool = await getPool();

    const stockResult = await pool.request().query(
      `
      SELECT
        S.StoreCode AS BranchCode,
        S.ID AS StoreId,
        C2.Description AS Category,
        VD.OldCode,
        (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code) AS ItemCode,
        IM.ProductName,
        M.ProductName AS Material,
        C.Color,
        F.Finish,
        SUM(SD.Stock) AS Stock
      FROM StoreDetail SD
      INNER JOIN Store S ON SD.FK_Store = S.ID
                    AND S.Active = 1
      INNER JOIN FinishProductVariantDetail VD ON SD.FK_Variant = VD.ID
      INNER JOIN ItemMaster IM ON VD.FK_ItemMasterID = IM.ID
      INNER JOIN Category3 C3 ON IM.FKSubGroupID = C3.ID
      INNER JOIN Category2 C2 ON C3.FK_Category2ID = C2.ID
      INNER JOIN FP_MaterialMaster M ON VD.FKMaterialID = M.ID
      INNER JOIN FP_ColorMaster C ON VD.FKColourID = C.ID
      INNER JOIN Finish F ON VD.FKFinishID = F.ID
      GROUP BY
        S.StoreCode,
        S.ID,
        C2.Description,
        VD.OldCode,
        (IM.ItemCode + '-' + M.M_Code + '-' + C.Code + '-' + F.Code),
        IM.ProductName,
        M.ProductName,
        C.Color,
        F.Finish
      HAVING SUM(SD.Stock) = 0
      ORDER BY
        BranchCode,
        ItemCode
      `
    );

    return res.status(200).json({
      success: true,
      message: "Zero stock items fetched successfully.",
      data: stockResult.recordset || []
    });
  } catch (err) {
    return next(err);
  }
};

router.get("/zero-stock", authJwt(), zeroStockHandler);
router.post("/zero-stock", authJwt(), zeroStockHandler);

router.post("/get-sales-update", authJwt(), async (req, res, next) => {
  try {
    const { branchCode, startDateTime, endDateTime, errors } = validateSalesUpdateBody(
      req.body
    );
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

    const salesUpdateResult = await pool
      .request()
      .input("BranchID", sql.Int, storeRow.StoreId)
      .input("StartDateTime", sql.DateTime, startDateTime)
      .input("EndDateTime", sql.DateTime, endDateTime)
      .query(
        `
        ;WITH SalesAgg AS (
          SELECT
            bs.ItemCode,
            SUM(bs.SaleQty) AS TotalSold
          FROM dbo.BranchSale bs
          INNER JOIN dbo.BranchDayEndMaster BDM ON bs.FK_BranchDayEndMaster = BDM.ID
          WHERE BDM.FK_StoreID = @BranchID
            AND bs.SaleDate >= @StartDateTime
            AND bs.SaleDate <= @EndDateTime
          GROUP BY bs.ItemCode
        ),
        DayEndAgg AS (
          SELECT
            BDD.ItemCode,
            SUM(CASE WHEN BDD.Flag = 'R' THEN BDD.ReceiveQty ELSE 0 END) AS TotalTransferredIn,
            SUM(CASE WHEN BDD.Flag = 'T' THEN BDD.TransferQty ELSE 0 END) AS TotalTransferredOut
          FROM dbo.BranchDayEndDetail BDD
          INNER JOIN dbo.BranchDayEndMaster BDM ON BDD.FK_BranchDayEnd = BDM.ID
          WHERE BDM.FK_StoreID = @BranchID
            AND BDD.Date >= @StartDateTime
            AND BDD.Date <= @EndDateTime
          GROUP BY BDD.ItemCode
        ),
        AllItems AS (
          SELECT bs.ItemCode
          FROM dbo.BranchSale bs
          INNER JOIN dbo.BranchDayEndMaster BDM ON bs.FK_BranchDayEndMaster = BDM.ID
          WHERE BDM.FK_StoreID = @BranchID
            AND bs.SaleDate >= @StartDateTime
            AND bs.SaleDate <= @EndDateTime

          UNION

          SELECT BDD.ItemCode
          FROM dbo.BranchDayEndDetail BDD
          INNER JOIN dbo.BranchDayEndMaster BDM ON BDD.FK_BranchDayEnd = BDM.ID
          WHERE BDM.FK_StoreID = @BranchID
            AND BDD.Date >= @StartDateTime
            AND BDD.Date <= @EndDateTime
        )
        SELECT
          ai.ItemCode,
          ISNULL(s.TotalSold, 0) AS TotalSold,
          ISNULL(d.TotalTransferredIn, 0) AS TotalTransferredIn,
          ISNULL(d.TotalTransferredOut, 0) AS TotalTransferredOut,
          (ISNULL(d.TotalTransferredIn, 0) - ISNULL(s.TotalSold, 0) - ISNULL(d.TotalTransferredOut, 0)) AS FinalStock
        FROM AllItems ai
        LEFT JOIN SalesAgg s ON ai.ItemCode = s.ItemCode
        LEFT JOIN DayEndAgg d ON ai.ItemCode = d.ItemCode
        ORDER BY ai.ItemCode
        `
      );

    return res.status(200).json({
      success: true,
      message: "Sales update fetched successfully.",
      data: salesUpdateResult.recordset || []
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
