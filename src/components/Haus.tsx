import React from "react";
import Carousel from "./Carousel";

export default function Haus() {
  const slides = [
    "/Haus0.png",
    "/Haus1.png",
    "/Haus2.png",
    "/Bad.png",
    "/Haus3.png",
    "/Haus4.png",
    "/Haus5.png",
    "/Haus6.gif",
  ];

  return (
    <div className="relative">
      <Carousel slides={slides} autoSlide={true} autoSlideInterval={3000} />
    </div>
  );
}
