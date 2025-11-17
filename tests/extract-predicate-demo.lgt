:- object(demo).

    :- public(process/2).
    
    process(Input, Output) :-
        % Some preprocessing
        atom_codes(Input, Codes),
        % Select these lines to extract
        reverse(Codes, ReversedCodes),
        atom_codes(Temp, ReversedCodes),
        % More processing
        atom_concat(Temp, '_processed', Output).

:- end_object.

