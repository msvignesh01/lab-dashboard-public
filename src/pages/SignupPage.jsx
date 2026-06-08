import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { UserPlus, Microscope, Eye, EyeOff, GraduationCap, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
// eslint-disable-next-line no-unused-vars -- motion.div used in JSX
import { motion } from 'framer-motion';
import { securityUtils } from '@/lib/security';
import { DEPARTMENTS, EMAIL_DOMAINS } from '@/lib/constants';
import CreatorCredit from '@/components/CreatorCredit';

// Generate dynamic year options for passout
const generatePassoutYears = () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-11, June is 5

    // If it's June or later, include next year, otherwise start from current year
    const startYear = currentMonth >= 5 ? currentYear + 1 : currentYear;
    const endYear = startYear + 4;

    const years = [];
    for (let year = startYear; year <= endYear; year++) {
        years.push(year.toString());
    }
    return years;
};

const SignupPage = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [department, setDepartment] = useState('');
    const [phone, setPhone] = useState('');
    const [registerNumber, setRegisterNumber] = useState('');
    const [specialization, setSpecialization] = useState('');
    const [yearOfPassout, setYearOfPassout] = useState('');
    const [role, setRole] = useState('student');
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Prevent double submission
        if (loading) return;

        try {
            // Trim inputs for validation
            const trimmedFullName = fullName.trim();
            const trimmedEmail = email.toLowerCase().trim();
            const trimmedDepartment = department.trim();
            const trimmedPhone = phone.trim();
            const trimmedRegisterNumber = registerNumber.trim();
            const trimmedSpecialization = specialization.trim();
            const trimmedYearOfPassout = yearOfPassout.trim();

            // Security: Validate email domain based on role
            const isValidStudentEmail = trimmedEmail.endsWith(EMAIL_DOMAINS.STUDENT);
            const isValidFacultyEmail = trimmedEmail.endsWith(EMAIL_DOMAINS.FACULTY) && !trimmedEmail.endsWith(EMAIL_DOMAINS.STUDENT);

            if (role === 'student' && !isValidStudentEmail) {
                toast.error(`Students must use ${EMAIL_DOMAINS.STUDENT} email addresses`);
                return;
            }

            if (role === 'faculty' && !isValidFacultyEmail) {
                toast.error(`Faculty must use ${EMAIL_DOMAINS.FACULTY} email addresses (not student subdomains)`);
                return;
            }

            // Security: Validate email format
            if (!securityUtils.validateEmail(trimmedEmail)) {
                toast.error('Please enter a valid email address');
                return;
            }

            // Security: Validate password strength
            if (!securityUtils.validatePassword(password)) {
                toast.error('Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character');
                return;
            }

            // Security: Validate required fields
            if (!trimmedFullName || trimmedFullName.length < 2) {
                toast.error('Please enter a valid full name');
                return;
            }

            if (!trimmedDepartment || !DEPARTMENTS.includes(trimmedDepartment)) {
                toast.error('Please select a valid department');
                return;
            }

            // Security: Validate student-specific fields
            if (role === 'student') {
                if (!securityUtils.validatePhoneNumber(trimmedPhone)) {
                    toast.error('Please enter a valid phone number');
                    return;
                }

                if (!trimmedRegisterNumber || trimmedRegisterNumber.length < 6) {
                    toast.error('Please enter a valid register number');
                    return;
                }

                if (!trimmedSpecialization || trimmedSpecialization.length < 2) {
                    toast.error('Please enter a valid specialization');
                    return;
                }

                if (!trimmedYearOfPassout || !generatePassoutYears().includes(trimmedYearOfPassout)) {
                    toast.error('Please select a valid year of passout');
                    return;
                }
            }

            setLoading(true);

            const metadata = {
                full_name: trimmedFullName,
                role,
                department: trimmedDepartment,
            };

            // Add student-specific fields
            if (role === 'student') {
                metadata.phone = trimmedPhone;
                metadata.register_number = trimmedRegisterNumber;
                metadata.specialization = trimmedSpecialization;
                metadata.year_of_passout = trimmedYearOfPassout;
            }

            const { error } = await signUp(trimmedEmail, password, metadata);
            if (error) throw error;

            toast.success(role === 'faculty'
                ? 'Faculty request created. Verify your email, then wait for admin approval.'
                : 'Account created! Please verify your email.');
            navigate('/login');
        } catch (error) {
            securityUtils.secureLog('error', 'Signup form submission failed', error?.message);
            toast.error('An error occurred during signup. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Input handlers - no HTML encoding, just raw form values
    const handleFullNameChange = (e) => {
        setFullName(e.target.value);
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
    };

    const handlePhoneChange = (e) => {
        // Allow only numbers, spaces, hyphens, and plus signs for phone
        const phoneOnly = e.target.value.replace(/[^0-9\s\-+()]/g, '');
        setPhone(phoneOnly);
    };

    const handleRegisterNumberChange = (e) => {
        // Allow only alphanumeric characters for register number
        const alphaNumericOnly = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
        setRegisterNumber(alphaNumericOnly);
    };

    const handleSpecializationChange = (e) => {
        setSpecialization(e.target.value);
    };

    return (
        <div className="min-h-[100dvh] flex items-start sm:items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 py-8">
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
                    <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
                    <p className="text-sm text-muted-foreground">Get started with the Additive Manufacturing Lab</p>
                </div>

                <Card className="border-border/50 shadow-xl backdrop-blur-xl bg-card/80">
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                            <div className="space-y-2">
                                <label htmlFor="signup-fullname" className="text-sm font-medium">Full Name</label>
                                <Input
                                    id="signup-fullname"
                                    placeholder="John Doe"
                                    value={fullName}
                                    onChange={handleFullNameChange}
                                    required
                                    autoComplete="name"
                                    maxLength={100}
                                />
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="signup-email" className="text-sm font-medium">Email</label>
                                <Input
                                    id="signup-email"
                                    type="email"
                                    placeholder={role === 'student' ? 'your.name@btech.christuniversity.in' : 'your.name@christuniversity.in'}
                                    value={email}
                                    onChange={handleEmailChange}
                                    required
                                    autoComplete="email"
                                    maxLength={254}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {role === 'student' ? `Students must use ${EMAIL_DOMAINS.STUDENT}` : `Faculty must use ${EMAIL_DOMAINS.FACULTY}`}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Account type</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setRole('student')}
                                        aria-pressed={role === 'student'}
                                        aria-label="Register as student"
                                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${role === 'student'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/50'
                                            }`}
                                    >
                                        <GraduationCap className="h-6 w-6" />
                                        <span className="text-sm font-medium">Student</span>
                                        <span className="text-xs text-muted-foreground">Self-service after email verification</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRole('faculty')}
                                        aria-pressed={role === 'faculty'}
                                        aria-label="Request faculty access"
                                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${role === 'faculty'
                                            ? 'border-primary bg-primary/5 text-primary'
                                            : 'border-border hover:border-muted-foreground/50'
                                            }`}
                                    >
                                        <BookOpen className="h-6 w-6" />
                                        <span className="text-sm font-medium">Faculty</span>
                                        <span className="text-xs text-muted-foreground">Requires admin approval</span>
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="signup-department" className="text-sm font-medium">Department</label>
                                <select
                                    id="signup-department"
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={department}
                                    onChange={(e) => setDepartment(e.target.value)}
                                    required
                                >
                                    <option value="">Select Department</option>
                                    {DEPARTMENTS.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </div>

                            {role === 'student' && (
                                <>
                                    <div className="space-y-2">
                                        <label htmlFor="signup-phone" className="text-sm font-medium">Phone Number</label>
                                        <Input
                                            id="signup-phone"
                                            type="tel"
                                            placeholder="+91 xxxxxxxxxx"
                                            value={phone}
                                            onChange={handlePhoneChange}
                                            required
                                            autoComplete="tel"
                                            maxLength={20}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="signup-register" className="text-sm font-medium">Register Number</label>
                                        <Input
                                            id="signup-register"
                                            placeholder="2xxxxxx"
                                            value={registerNumber}
                                            onChange={handleRegisterNumberChange}
                                            required
                                            autoComplete="off"
                                            maxLength={20}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="signup-specialization" className="text-sm font-medium">Specialization</label>
                                        <Input
                                            id="signup-specialization"
                                            placeholder="E.g., Data Science, AI/ML, IoT, Cybersecurity"
                                            value={specialization}
                                            onChange={handleSpecializationChange}
                                            required
                                            autoComplete="off"
                                            maxLength={100}
                                        />
                                        <p className="text-xs text-muted-foreground">Mention your course</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label htmlFor="signup-passout" className="text-sm font-medium">Year of Passout</label>
                                        <select
                                            id="signup-passout"
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={yearOfPassout}
                                            onChange={(e) => setYearOfPassout(e.target.value)}
                                            required
                                        >
                                            <option value="">Select Year</option>
                                            {generatePassoutYears().map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                            <div className="space-y-2">
                                <label htmlFor="signup-password" className="text-sm font-medium">Password</label>
                                <div className="relative">
                                    <Input
                                        id="signup-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        autoComplete="new-password"
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
                                <p className="text-xs text-muted-foreground">Must be at least 8 characters with uppercase, lowercase, number, and special character</p>
                            </div>
                            <Button type="submit" className="w-full font-bold" disabled={loading}>
                                <UserPlus className="mr-2 h-4 w-4" /> {loading ? 'Creating...' : 'Create Account'}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="justify-center border-t p-4 bg-muted/20">
                        <p className="text-sm text-muted-foreground">
                            Already have an account? <Link to="/login" className="text-primary hover:underline font-medium">Log in</Link>
                        </p>
                    </CardFooter>
                </Card>
                <CreatorCredit />
            </motion.div>
        </div>
    );
};

export default SignupPage;
