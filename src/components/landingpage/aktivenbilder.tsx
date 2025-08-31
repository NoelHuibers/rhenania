// components/landingpage/aktivenbilder.tsx
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

interface AktivenbilderProps {
  images: {
    id: string;
    imageUrl: string;
    imageName: string;
    displayOrder: number;
  }[];
}

const Aktivenbilder = ({ images }: AktivenbilderProps) => {
  const plugin = React.useRef(
    Autoplay({ delay: 2000, stopOnInteraction: true })
  );

  // Fallback images if no images from database
  const fallbackImages = [
    {
      id: "1",
      imageUrl: "/0.png",
      imageName: "Aktivenbild 1",
      displayOrder: 0,
    },
    {
      id: "2",
      imageUrl: "/1.jpg",
      imageName: "Aktivenbild 2",
      displayOrder: 1,
    },
    {
      id: "3",
      imageUrl: "/2.png",
      imageName: "Aktivenbild 3",
      displayOrder: 2,
    },
    {
      id: "4",
      imageUrl: "/3.jpg",
      imageName: "Aktivenbild 4",
      displayOrder: 3,
    },
  ];

  const displayImages = images.length > 0 ? images : fallbackImages;

  return (
    <div className="flex justify-center items-center w-full px-4">
      <Carousel
        plugins={[plugin.current]}
        className="w-full"
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

export default Aktivenbilder;
