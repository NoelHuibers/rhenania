"use client";

import { type Variants, motion } from "framer-motion";
import Link from "next/link";

const ContactButton = () => {
const buttonVariants = {
  initial: {
    background: "rgb(17 24 39)",
    backgroundPosition: "0% 50%",
    color: "rgb(248 250 252)", // text-slate-50
  },
  hover: {
    background: [
      "linear-gradient(-135deg, #fecaca 33%, #ffffff 33%, #ffffff 66%, #ebf8ff 66%)",
    ],
    backgroundPosition: "100% 50%",
    color: "rgb(17 24 39)", // text-gray-900
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
} satisfies Variants;

  return (
    <motion.div
      className="inline-flex h-12 items-center justify-center rounded-md px-10 font-semibold text-base text-slate-50 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50"
      variants={buttonVariants}
      initial="initial"
      whileHover="hover"
      style={{ backgroundSize: "300% 300%" }}
      animate="initial"
    >
      <Link
        href="/contact"
        className="flex h-full w-full items-center justify-center bg-transparent"
      >
        Bewirb dich
      </Link>
    </motion.div>

  );
};

export default ContactButton;
