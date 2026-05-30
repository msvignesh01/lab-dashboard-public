import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { LogIn, Microscope, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { securityUtils } from '@/lib/security';
import { RATE_LIMIT } from '@/lib/constants';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [lockoutRemaining, setLockoutRemaining] = useState(0);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    // Client-side throttle for repeated mistakes. Firebase Auth remains authoritative.
    useEffect(() => {
        const checkRateLimit = () => {
            try {
                const stored = sessionStorage.getItem(RATE_LIMIT.STORAGE_KEY);
                if (stored) {
                    const { lockedUntil } = JSON.parse(stored);
                    const now = Date.now();
                    if (lockedUntil && now < lockedUntil) {
                        setIsLocked(true);
                        setLockoutRemaining(Math.ceil((lockedUntil - now) / 1000));
                    } else if (lockedUntil && now >= lockedUntil) {
                        // Lockout expired, reset
                        sessionStorage.removeItem(RATE_LIMIT.STORAGE_KEY);
                        setIsLocked(false);
                        setLockoutRemaining(0);
                    }
                }
            } catch {
                // If sessionStorage fails, continue without rate limiting
            }
        };

        checkRateLimit();
        const interval = setInterval(checkRateLimit, 1000);
        return () => clearInterval(interval);
    }, []);

    const incrementAttempts = () => {
        try {
            const stored = sessionStorage.getItem(RATE_LIMIT.STORAGE_KEY);
            let data = stored ? JSON.parse(stored) : { count: 0, lockedUntil: null };
            data.count += 1;

            if (data.count >= RATE_LIMIT.MAX_LOGIN_ATTEMPTS) {
                data.lockedUntil = Date.now() + RATE_LIMIT.LOCKOUT_DURATION_MS;
                setIsLocked(true);
                setLockoutRemaining(RATE_LIMIT.LOCKOUT_DURATION_MS / 1000);
            }

            sessionStorage.setItem(RATE_LIMIT.STORAGE_KEY, JSON.stringify(data));
        } catch {
            // If sessionStorage fails, continue
        }
    };

    const clearAttempts = () => {
        try {
            sessionStorage.removeItem(RATE_LIMIT.STORAGE_KEY);
            setIsLocked(false);
            setLockoutRemaining(0);
        } catch {
            // If sessionStorage fails, continue
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Prevent double submission
        if (loading) return;

        // Check if locked out
        if (isLocked) {
            toast.error(`Too many attempts. Please wait ${lockoutRemaining} seconds.`);
            return;
        }

        try {
            // Security: Validate email
            const trimmedEmail = email.toLowerCase().trim();

            // Security: Validate email format
            if (!securityUtils.validateEmail(trimmedEmail)) {
                toast.error('Please enter a valid email address');
                return;
            }

            setLoading(true);

            const { error } = await signIn(trimmedEmail, password);
            if (error) {
                incrementAttempts();
                throw error;
            }

            // Reset login attempts on successful login
            clearAttempts();
            toast.success('Successfully logged in');
            navigate('/');
        } catch (error) {
            securityUtils.secureLog('warn', 'Login failed', { email: securityUtils.maskEmail(email) });

            const message = typeof error?.message === 'string' && error.message.trim()
                ? error.message
                : 'Invalid email or password. Please try again.';

            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    // Security: Sanitize input handlers
    const handleEmailChange = (e) => {
        setEmail(e.target.value);
    };

    return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-md space-y-4"
            >
                <div className="text-center space-y-2 mb-8">
                    <div className="flex justify-center">
                        <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg">
                            <Microscope className="h-7 w-7" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Welcome to Additive Manufacturing Lab</h1>
                    <p className="text-sm text-muted-foreground">Enter your credentials to access your lab dashboard</p>
                </div>

                <Card className="border-border/50 shadow-xl backdrop-blur-xl bg-card/80">
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off" aria-label="Login form">
                            <div className="space-y-2">
                                <label htmlFor="login-email" className="text-sm font-medium leading-none">Email</label>
                                <Input
                                    id="login-email"
                                    type="email"
                                    placeholder="your@university.edu"
                                    value={email}
                                    onChange={handleEmailChange}
                                    required
                                    autoComplete="email"
                                    maxLength={254}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="login-password" className="text-sm font-medium leading-none">Password</label>
                                <div className="relative">
                                    <Input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        autoComplete="current-password"
                                        className="pr-10"
                                        maxLength={128}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            <Button type="submit" className="w-full font-bold" disabled={loading || isLocked}>
                                <LogIn className="mr-2 h-4 w-4" /> {isLocked ? `Locked (${lockoutRemaining}s)` : loading ? 'Signing in...' : 'Sign In'}
                            </Button>
                            {isLocked && (
                                <p className="text-xs text-destructive text-center mt-2" role="alert" aria-live="assertive">
                                    Too many failed attempts. Please wait {lockoutRemaining} seconds.
                                </p>
                            )}
                        </form>
                    </CardContent>
                    <CardFooter className="justify-center border-t p-4 bg-muted/20">
                        <p className="text-sm text-muted-foreground">
                            Don't have an account? <Link to="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
                        </p>
                    </CardFooter>
                </Card>
            </motion.div>
        </div>
    );
};

export default LoginPage;
