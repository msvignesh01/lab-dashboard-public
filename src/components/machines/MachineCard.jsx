import React from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Info } from 'lucide-react';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { securityUtils } from '@/lib/security';

const MachineCard = ({ machine, onBook, onDetails }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -5 }}
        >
            <Card className="overflow-hidden border-border/50 h-full flex flex-col group hover:shadow-xl transition-all duration-300">
                <div className="aspect-video w-full bg-muted relative overflow-hidden">
                    {securityUtils.isSafeImageUrl(machine.image_url) ? (
                        <img
                            src={machine.image_url}
                            alt={machine.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/50" role="img" aria-label="No image available">
                            <Info className="h-10 w-10 opacity-20" />
                        </div>
                    )}
                    <div className="absolute top-2 right-2">
                        <Badge variant={machine.is_active ? "success" : "destructive"} className="shadow-sm">
                            {machine.is_active ? "Available" : "Maintenance"}
                        </Badge>
                    </div>
                </div>

                <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-bold line-clamp-1 group-hover:text-primary transition-colors">
                            {machine.name}
                        </CardTitle>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3 mr-1" />
                        {machine.location || 'Location not specified'}
                    </div>
                </CardHeader>

                <CardContent className="p-4 pt-0 flex-grow">
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {machine.description || 'No description available'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                        {machine.department && (
                            <Badge variant="outline" className="text-[10px] h-5">{machine.department}</Badge>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="p-4 pt-0 flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => onDetails(machine)}
                        aria-label={`View details for ${machine.name}`}
                    >
                        Details
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1" // "flex-1 shadow-lg shadow-primary/20"
                        onClick={() => onBook(machine)}
                        disabled={!machine.is_active}
                        aria-label={`Book ${machine.name}`}
                    >
                        Book Now
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
};

export default MachineCard;
