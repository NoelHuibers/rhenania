"use client";

import Autoplay from "embla-carousel-autoplay";
import Image from "next/image";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "~/components/ui/carousel";

const Hauscarousel = () => {
	return (
		<Carousel
			className="mx-auto w-full max-w-6xl"
			plugins={[
				Autoplay({
					delay: 4000,
				}),
			]}
		>
			<CarouselContent>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus0.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus1.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus2.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus3.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus4.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus5.png"
						width={1200}
					/>
				</CarouselItem>
				<CarouselItem>
					<Image
						alt="Rhenanenhaus"
						className="aspect-[2/1] rounded-lg object-cover"
						height={600}
						src="/Haus6.gif"
						unoptimized
						width={1200}
					/>
				</CarouselItem>
			</CarouselContent>
			<div className="hidden md:block">
				<CarouselPrevious />
				<CarouselNext />
			</div>
		</Carousel>
	);
};

export default Hauscarousel;
