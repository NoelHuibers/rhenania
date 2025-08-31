// components/landingpage/hauscarousel.tsx
"use client";

import Autoplay from "embla-carousel-autoplay";
import Image from "next/image";
import React from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";

interface HauscarouselProps {
  images: {
    id: string;
    imageUrl: string;
    imageName: string;
    displayOrder: number;
  }[];
}

const Hauscarousel = ({ images }: HauscarouselProps) => {
  const plugin = React.useRef(
    Autoplay({ delay: 4000, stopOnInteraction: true })
  );

  // Fallback images if no images from database
  const fallbackImages = [
    {
      id: "1",
      imageUrl: "/Haus0.png",
      imageName: "Rhenanenhaus 1",
      displayOrder: 0,
    },
    {
      id: "2",
      imageUrl: "/Haus1.png",
      imageName: "Rhenanenhaus 2",
      displayOrder: 1,
    },
    {
      id: "3",
      imageUrl: "/Haus2.png",
      imageName: "Rhenanenhaus 3",
      displayOrder: 2,
    },
    {
      id: "4",
      imageUrl: "/Haus3.png",
      imageName: "Rhenanenhaus 4",
      displayOrder: 3,
    },
    {
      id: "5",
      imageUrl: "/Haus4.png",
      imageName: "Rhenanenhaus 5",
      displayOrder: 4,
    },
    {
      id: "6",
      imageUrl: "/Haus5.png",
      imageName: "Rhenanenhaus 6",
      displayOrder: 5,
    },
    {
      id: "7",
      imageUrl: "/Haus6.gif",
      imageName: "Rhenanenhaus 7",
      displayOrder: 6,
    },
  ];

  const displayImages = images.length > 0 ? images : fallbackImages;

  return (
    <div className="flex justify-center items-center w-full px-4">
      <Carousel
        plugins={[plugin.current]}
        className="w-full max-w-6xl"
        onMouseEnter={plugin.current.stop}
        onMouseLeave={plugin.current.reset}
        opts={{
          align: "center",
          loop: true,
        }}
      >
        <CarouselContent>
          {displayImages.map((image) => (
            <CarouselItem key={image.id}>
              <div className="relative w-full">
                <Image
                  alt={image.imageName}
                  className="w-full h-auto rounded-lg object-cover aspect-[2/1]"
                  height={600}
                  src={image.imageUrl}
                  width={1200}
                  priority={image.displayOrder === 0}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1200px"
                  unoptimized={image.imageUrl.endsWith(".gif")}
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="hidden md:block">
          <CarouselPrevious className="left-2 lg:-left-12" />
          <CarouselNext className="right-2 lg:-right-12" />
        </div>
      </Carousel>
    </div>
  );
};

export default Hauscarousel;
