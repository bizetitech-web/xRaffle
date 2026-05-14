import { validationResult } from 'express-validator';

export const handleValidationErrors = (req, res, next) => {
	const errors = validationResult(req);

	if (errors.isEmpty()) {
		return next();
	}

	return res.status(400).json({
		error: 'Validation failed',
		details: errors.array().map((err) => ({
			field: err.path,
			message: err.msg,
			value: err.value,
		})),
	});
};

export const validate = () => handleValidationErrors;
