:- object(test).

	:- public(swap_token/2).
	:- mode(swap_token(++term, -term), one).
	:- public(filter_character_codes/2).
	:- mode(filter_character_codes(+list(code), -list(code)), one).
	:- info(filter_character_codes/2, [
		comment is 'Filters control characters.',
		argnames is ['Codes', 'FilteredCodes']
	]).
	:- public(file_tokens/2).
	:- mode(file_tokens(+atom, -term), one).
	:- info(file_tokens/2, [
		comment is 'Tokenizes the file.',
		argnames is ['Filename', 'Tokens']
	]).

:- end_object.

