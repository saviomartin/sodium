import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2).max(80).describe("Full name"),
  email: z.string().email(),
  topic: z.enum(["support", "sales", "feedback"]).default("support"),
  message: z.string().min(10).max(2000),
});

export const addToCartSchema = z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(10),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  confirm: z.boolean(),
});
