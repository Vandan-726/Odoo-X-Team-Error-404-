import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import departmentsRouter from "./departments";
import categoriesRouter from "./categories";
import usersRouter from "./users";
import assetsRouter from "./assets";
import allocationsRouter from "./allocations";
import transfersRouter from "./transfers";
import bookingsRouter from "./bookings";
import maintenanceRouter from "./maintenance";
import auditsRouter from "./audits";
import reportsRouter from "./reports";
import notificationsRouter from "./notifications";
import activityRouter from "./activity";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(departmentsRouter);
router.use(categoriesRouter);
router.use(usersRouter);
router.use(assetsRouter);
router.use(allocationsRouter);
router.use(transfersRouter);
router.use(bookingsRouter);
router.use(maintenanceRouter);
router.use(auditsRouter);
router.use(reportsRouter);
router.use(notificationsRouter);
router.use(activityRouter);

export default router;
