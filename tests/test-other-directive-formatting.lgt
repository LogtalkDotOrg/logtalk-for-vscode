% Test file for other directive formatting
% Tests that formatOtherDirective ensures:
% 1. Single space after ":-"
% 2. Single space separating arguments if there are two or more

:- object(test_other_directives).

	% Test directives with no arguments (arity 0)
	:-built_in.
	:-  dynamic.

	% Test directives with one argument
	:-include(file).
	:-  include(  file  ).

	% Test directives with two arguments - should have single space after comma
	:-op(500,yfx,operator).
	:-  op(  500  ,  yfx  ,  operator  ).
	:-op(600,  xfx,  another_op).

	% Test directives with three arguments
	:-encoding(utf8,bom,strict).
	:-  encoding(  utf8  ,  bom  ,  strict  ).

	% Test directives with complex arguments
	:-op(700,xfx,[and,or,implies]).
	:-  op(  700  ,  xfx  ,  [and,or,implies]  ).

	% Test ensure_loaded directive
	:-ensure_loaded(library).
	:-  ensure_loaded(  library  ).

	% Test include directive with path
	:-include('path/to/file.lgt').
	:-  include(  'path/to/file.lgt'  ).

:- end_object.

